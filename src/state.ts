import type * as acp from "@agentclientprotocol/sdk";

export type Message = {
  id: string;
  type: "message";
  role: "user" | "agent" | "thought" | "system";
  text: string;
  messageId?: string | null;
};
export type Tool = { id: string; type: "tool" } & acp.ToolCall;
export type TimelineItem = Message | Tool;
export type Session = {
  id: string;
  agent: string;
  cwd: string;
  remoteId?: string;
  title: string;
  updatedAt: number;
  items: TimelineItem[];
  plan: acp.PlanEntry[];
  commands: acp.AvailableCommand[];
  configOptions: acp.SessionConfigOption[];
  modes?: acp.SessionModeState | null;
  usage?: acp.UsageUpdate;
  /** Local receipt time of the latest usage snapshot, in epoch milliseconds. */
  usageUpdatedAt?: number;
  terminalOutput?: Record<string, string>;
};

export function newSession(agent: string, cwd: string): Session {
  return {
    id: crypto.randomUUID(),
    agent,
    cwd,
    title: "New session",
    updatedAt: Date.now(),
    items: [],
    plan: [],
    commands: [],
    configOptions: [],
  };
}

export function contentText(content: acp.ContentBlock): string {
  switch (content.type) {
    case "text":
      return content.text;
    case "resource_link":
      return `[${content.name}](${content.uri})`;
    case "resource":
      return "text" in content.resource
        ? content.resource.text
        : `[Resource: ${content.resource.uri}]`;
    case "image":
      return `[Image: ${content.mimeType}]`;
    case "audio":
      return `[Audio: ${content.mimeType}]`;
    default:
      return "[Unsupported content]";
  }
}

export function addMessage(session: Session, role: Message["role"], text: string) {
  session.items.push({ id: crypto.randomUUID(), type: "message", role, text });
  session.updatedAt = Date.now();
}

/** Mutates the domain state; the controller publishes snapshots at frame rate. */
export function applyUpdate(session: Session, update: acp.SessionUpdate, receivedAt = Date.now()) {
  session.updatedAt = Date.now();
  switch (update.sessionUpdate) {
    case "agent_message_chunk":
    case "agent_thought_chunk":
    case "user_message_chunk": {
      const role =
        update.sessionUpdate === "user_message_chunk"
          ? "user"
          : update.sessionUpdate === "agent_thought_chunk"
            ? "thought"
            : "agent";
      const last = session.items.at(-1);
      const text = contentText(update.content);
      if (
        last?.type === "message" &&
        last.role === role &&
        (last.messageId ?? undefined) === (update.messageId ?? undefined)
      )
        last.text += text;
      else
        session.items.push({
          id: crypto.randomUUID(),
          type: "message",
          role,
          text,
          messageId: update.messageId,
        });
      break;
    }
    case "tool_call":
    case "tool_call_update": {
      let tool = session.items.find(
        (item): item is Tool => item.type === "tool" && item.toolCallId === update.toolCallId,
      );
      if (!tool) {
        tool = {
          id: crypto.randomUUID(),
          type: "tool",
          toolCallId: update.toolCallId,
          title: "Tool",
          status: "pending",
        };
        session.items.push(tool);
      }
      // ACP tool updates are patches: missing and null fields leave the old value intact.
      for (const [key, value] of Object.entries(update)) {
        if (key !== "sessionUpdate" && value != null) Object.assign(tool, { [key]: value });
      }
      break;
    }
    case "plan":
      session.plan = update.entries;
      break;
    case "available_commands_update":
      session.commands = update.availableCommands;
      break;
    case "config_option_update":
      session.configOptions = update.configOptions;
      break;
    case "current_mode_update":
      if (session.modes) session.modes.currentModeId = update.currentModeId;
      break;
    case "session_info_update":
      if (update.title != null) session.title = update.title;
      break;
    case "usage_update":
      // Usage is a snapshot, and cost is cumulative rather than an increment.
      session.usage = update;
      session.usageUpdatedAt = receivedAt;
      break;
    case "notice":
      addMessage(
        session,
        "system",
        `${update.title}${update.description ? `\n${update.description}` : ""}`,
      );
      break;
  }
}

export function changedFiles(session: Session): string[] {
  return [
    ...new Set(
      session.items.flatMap(item =>
        item.type === "tool"
          ? (item.content ?? []).flatMap(content => (content.type === "diff" ? [content.path] : []))
          : [],
      ),
    ),
  ];
}
