import * as acp from "@agentclientprotocol/sdk";
import { EventEmitter } from "node:events";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Config } from "./config";
import { Storage } from "./storage";
import { addMessage, applyUpdate, newSession, type Session } from "./state";
import { AgentClient } from "./acp/client";
import { sessionMode } from "./modes";

export type Interaction = {
  id: string;
  title: string;
  description?: string;
  options: { id: string; name: string }[];
  form?: acp.ElicitationSchema;
  url?: string;
};
export type Status = "disconnected" | "connecting" | "ready" | "working" | "cancelling" | "history";
export type Snapshot = {
  session: Session;
  status: Status;
  interaction?: Interaction;
  error?: string;
  agentName?: string;
  terminalOutput: Record<string, string>;
};

export class Controller extends EventEmitter {
  session: Session;
  status: Status = "disconnected";
  error?: string;
  client?: AgentClient;
  private pending: {
    interaction: Interaction;
    answer: (id?: string, content?: Record<string, acp.ElicitationContentValue>) => void;
  }[] = [];
  private terminalOutput: Record<string, string> = {};
  private publishTimer?: ReturnType<typeof setTimeout>;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private cancelTimer?: ReturnType<typeof setTimeout>;
  private closed = false;
  private generation = 0;
  private settingRequest?: symbol;

  constructor(
    readonly config: Config,
    readonly storage: Storage,
    readonly cwd: string,
    agent: string,
    private logPath?: string,
  ) {
    super();
    this.session = newSession(agent, cwd);
  }
  get busy() {
    return ["connecting", "working", "cancelling"].includes(this.status);
  }
  snapshot(): Snapshot {
    return {
      session: structuredClone(this.session),
      status: this.status,
      error: this.error,
      interaction: this.pending[0]?.interaction,
      agentName: this.client?.info?.agentInfo?.title ?? this.client?.info?.agentInfo?.name,
      terminalOutput: { ...this.terminalOutput },
    };
  }
  private publish(immediate = false) {
    if (this.closed) return;
    if (immediate) {
      clearTimeout(this.publishTimer);
      this.publishTimer = undefined;
      this.emit("change", this.snapshot());
    } else if (!this.publishTimer) this.publishTimer = setTimeout(() => this.publish(true), 32);
    if (!this.saveTimer)
      this.saveTimer = setTimeout(() => {
        this.saveTimer = undefined;
        this.persist();
      }, 500);
  }
  private persist() {
    if (this.session.items.some(item => item.type === "tool" || item.role !== "system"))
      this.storage.save(this.session);
  }
  report(error: unknown) {
    this.error = error instanceof Error ? error.message : String(error);
    this.publish(true);
  }
  clearError() {
    this.error = undefined;
    this.publish(true);
  }
  recordInput(text: string, attachments: string[] = []) {
    this.session.inputHistory ??= this.session.items.flatMap(item =>
      item.type === "message" && item.role === "user" ? [{ text: item.text, attachments: [] }] : [],
    );
    this.session.inputHistory.push({ text, attachments: [...attachments] });
    this.session.updatedAt = Date.now();
    this.persist();
    this.publish(true);
  }

  private ask(
    interaction: Interaction,
    signal: AbortSignal,
  ): Promise<{ id?: string; content?: Record<string, acp.ElicitationContentValue> }> {
    return new Promise(resolve => {
      const abort = () => entry.answer();
      const entry = {
        interaction,
        answer: (id?: string, content?: Record<string, acp.ElicitationContentValue>) => {
          signal.removeEventListener("abort", abort);
          this.pending = this.pending.filter(item => item !== entry);
          resolve({ id, content });
          this.publish(true);
        },
      };
      if (signal.aborted || this.status === "cancelling" || this.closed) {
        resolve({});
        return;
      }
      this.pending.push(entry);
      signal.addEventListener("abort", abort, { once: true });
      this.publish(true);
    });
  }
  answer(id?: string, content?: Record<string, acp.ElicitationContentValue>) {
    this.pending[0]?.answer(id, content);
  }
  private dismissInteractions() {
    for (const item of [...this.pending]) item.answer();
  }

  async open(saved?: Session, agent = this.session.agent) {
    if (this.closed) return;
    if (this.busy) throw new Error("Cancel the current operation before changing sessions.");
    const definition = this.config.agents[saved?.agent ?? agent];
    if (!definition) throw new Error(`Agent is not configured: ${saved?.agent ?? agent}`);
    this.persist();
    this.client?.dispose();
    this.dismissInteractions();
    const generation = ++this.generation;
    this.settingRequest = undefined;
    this.session = saved ? structuredClone(saved) : newSession(agent, this.cwd);
    if (!this.session.remoteId) {
      this.session.usage = undefined;
      this.session.usageUpdatedAt = undefined;
    }
    this.session.commands = [];
    this.session.configOptions = [];
    this.session.modes = undefined;
    this.terminalOutput = this.session.terminalOutput ?? {};
    this.status = "connecting";
    this.error = undefined;
    const session = this.session;
    const current = () =>
      !this.closed && generation === this.generation && this.status !== "disconnected";
    let replay: { update: acp.SessionUpdate; receivedAt: number }[] | undefined;
    const client = (this.client = new AgentClient(
      definition,
      session.cwd,
      {
        update: notification => {
          if (
            generation !== this.generation ||
            (session.remoteId && notification.sessionId !== session.remoteId)
          )
            return;
          if (replay) replay.push({ update: notification.update, receivedAt: Date.now() });
          else applyUpdate(session, notification.update);
          this.publish();
        },
        permission: async (params, signal) => {
          if (session.remoteId && params.sessionId !== session.remoteId)
            return { outcome: { outcome: "cancelled" } };
          applyUpdate(session, { ...params.toolCall, sessionUpdate: "tool_call_update" });
          const result = await this.ask(
            {
              id: crypto.randomUUID(),
              title: params.toolCall.title ?? "Tool permission",
              description: "Choose the permission scope offered by the agent.",
              options: params.options.map(o => ({ id: o.optionId, name: o.name })),
            },
            signal,
          );
          return {
            outcome: result.id
              ? { outcome: "selected", optionId: result.id }
              : { outcome: "cancelled" },
          };
        },
        question: async (params, signal) => {
          if (acp.CreateElicitationRequest.isForm(params)) {
            const result = await this.ask(
              {
                id: crypto.randomUUID(),
                title: params.message,
                form: params.requestedSchema,
                options: [
                  { id: "accept", name: "Submit answer" },
                  { id: "decline", name: "Decline" },
                ],
              },
              signal,
            );
            return result.id === "accept"
              ? { action: "accept", content: result.content }
              : { action: result.id === "decline" ? "decline" : "cancel" };
          }
          if (acp.CreateElicitationRequest.isUrl(params)) {
            const result = await this.ask(
              {
                id: params.elicitationId,
                title: params.message,
                url: params.url,
                options: [
                  { id: "accept", name: "I have opened the URL" },
                  { id: "decline", name: "Decline" },
                ],
              },
              signal,
            );
            return { action: result.id ?? "cancel" };
          }
          return { action: "decline" };
        },
        terminal: (id, output) => {
          if (generation !== this.generation) return;
          this.terminalOutput[id] = output;
          session.terminalOutput = this.terminalOutput;
          this.publish();
        },
        elicitationComplete: id => {
          if (generation !== this.generation) return;
          this.pending.find(item => item.interaction.id === id)?.answer("accept");
          addMessage(session, "system", "The external interaction completed.");
          this.publish(true);
        },
        disconnected: message => {
          if (generation !== this.generation || this.closed || this.status === "disconnected")
            return;
          this.dismissInteractions();
          this.status = "disconnected";
          this.error = message;
          this.publish(true);
        },
      },
      this.logPath,
    ));
    this.publish(true);
    try {
      const info = await client.connect();
      if (generation !== this.generation || this.closed) return;
      let result: acp.NewSessionResponse | acp.LoadSessionResponse;
      if (saved?.remoteId) {
        if (info.agentCapabilities?.sessionCapabilities?.resume) {
          result = await client.withTimeout(
            client.agent.request(acp.methods.agent.session.resume, {
              sessionId: saved.remoteId,
              cwd: session.cwd,
              mcpServers: [],
            }),
          );
        } else if (info.agentCapabilities?.loadSession) {
          replay = [];
          result = await client.withTimeout(
            client.agent.request(acp.methods.agent.session.load, {
              sessionId: saved.remoteId,
              cwd: session.cwd,
              mcpServers: [],
            }),
          );
          if (this.closed || generation !== this.generation) return;
          // Replace only after a successful load, so failures preserve the local transcript.
          const updates = replay;
          replay = undefined;
          session.items = [];
          session.plan = [];
          for (const { update, receivedAt } of updates) applyUpdate(session, update, receivedAt);
        } else {
          this.status = "history";
          this.error =
            "This agent cannot resume sessions. This is a read-only transcript; create a new session to chat.";
          this.publish(true);
          return;
        }
      } else {
        result = await client.withTimeout(
          client.agent.request(acp.methods.agent.session.new, { cwd: session.cwd, mcpServers: [] }),
        );
        if (this.closed || generation !== this.generation) return;
        session.remoteId = (result as acp.NewSessionResponse).sessionId;
      }
      if (this.closed || generation !== this.generation) return;
      session.modes = result.modes;
      session.configOptions = result.configOptions ?? [];
      if (!saved?.remoteId) {
        const remembered = this.storage.setting<string | undefined>(
          `model:${session.agent}`,
          undefined,
        );
        const model = session.configOptions.find(
          option => option.category === "model" && option.type === "select",
        );
        if (remembered !== undefined && model?.currentValue !== remembered) {
          const choices =
            model?.type === "select"
              ? model.options.flatMap(option => ("options" in option ? option.options : [option]))
              : [];
          if (!model || !choices.some(choice => choice.value === remembered)) {
            this.error = `Remembered model "${remembered}" is unavailable; using the agent's default.`;
          } else {
            try {
              const configured = await client.withTimeout(
                client.agent.request(acp.methods.agent.session.setConfigOption, {
                  sessionId: session.remoteId!,
                  configId: model.id,
                  value: remembered,
                }),
              );
              if (!current()) return;
              session.configOptions = configured.configOptions;
              if (
                !session.configOptions.some(
                  option => option.id === model.id && option.currentValue === remembered,
                )
              ) {
                this.error = `The agent did not confirm remembered model "${remembered}"; using the agent's current model.`;
              }
            } catch (error) {
              if (!current()) return;
              this.error = `Could not restore remembered model "${remembered}"; using the agent's current model. ${error instanceof Error ? error.message : String(error)}`;
            }
          }
        }
      }
      if (!current()) return;
      this.status = "ready";
      this.persist();
      this.publish(true);
    } catch (error) {
      if (this.closed || generation !== this.generation) return;
      replay = undefined;
      this.status = saved ? "history" : "disconnected";
      this.report(error);
    }
  }

  async send(text: string, attachments: string[] = []) {
    if (this.status !== "ready" || !this.session.remoteId || !this.client)
      throw new Error("Connect to an agent before sending a message.");
    if (!text.trim() && !attachments.length) return;
    const session = this.session,
      client = this.client;
    const generation = this.generation;
    this.status = "working";
    this.error = undefined;
    this.publish(true);
    try {
      const prompt: acp.ContentBlock[] = [{ type: "text", text }];
      for (const path of attachments) {
        const absolute = resolve(session.cwd, path);
        const file = Bun.file(absolute);
        if (file.size > 1024 * 1024) throw new Error(`Attachment exceeds 1 MiB: ${path}`);
        const content = await file.text();
        if (content.includes("\0"))
          throw new Error(`Only text file attachments are supported: ${path}`);
        if (client.info?.agentCapabilities?.promptCapabilities?.embeddedContext) {
          prompt.push({
            type: "resource",
            resource: { uri: pathToFileURL(absolute).href, text: content, mimeType: "text/plain" },
          });
        } else prompt.push({ type: "text", text: `\nFile: ${absolute}\n${content}` });
      }
      if (generation !== this.generation || this.closed || this.status !== "working") return;
      if (!session.items.some(i => i.type === "message" && i.role === "user"))
        session.title = text.trim().split("\n")[0]?.slice(0, 70) || "File discussion";
      this.recordInput(text, attachments);
      addMessage(
        session,
        "user",
        text + (attachments.length ? `\n\nAttached: ${attachments.join(", ")}` : ""),
      );
      this.persist();
      this.publish(true);
      const result = await client.agent.request(acp.methods.agent.session.prompt, {
        sessionId: session.remoteId!,
        prompt,
      });
      if (generation !== this.generation || this.closed) return;
      if (result.stopReason !== "end_turn")
        addMessage(session, "system", `Turn stopped: ${result.stopReason}`);
    } catch (error) {
      if (generation === this.generation && !this.closed) this.report(error);
    } finally {
      if (generation !== this.generation || this.closed) return;
      clearTimeout(this.cancelTimer);
      this.dismissInteractions();
      if (this.status === "working" || this.status === "cancelling") this.status = "ready";
      this.persist();
      this.publish(true);
    }
  }
  async cancel() {
    if (!this.busy || !this.client) return;
    if (this.status === "connecting" || this.status === "cancelling") {
      this.generation++;
      clearTimeout(this.cancelTimer);
      this.client.dispose();
      this.dismissInteractions();
      this.status = "disconnected";
      this.publish(true);
      return;
    }
    this.status = "cancelling";
    this.dismissInteractions();
    this.publish(true);
    this.cancelTimer = setTimeout(() => {
      this.client?.dispose();
      this.status = "disconnected";
      this.report("Agent did not finish cancellation within 5 seconds; disconnected.");
    }, 5000);
    await this.client.agent.notify(acp.methods.agent.session.cancel, {
      sessionId: this.session.remoteId!,
    });
  }
  async setMode(modeId: string) {
    await this.changeSetting(
      (client, session) =>
        client.agent.request(acp.methods.agent.session.setMode, {
          sessionId: session.remoteId!,
          modeId,
        }),
      (_, session) => {
        if (session.modes) session.modes.currentModeId = modeId;
      },
    );
  }
  async setConfig(configId: string, value: string | boolean) {
    const model = this.session.configOptions.find(
      option => option.category === "model" && option.type === "select",
    );
    await this.changeSetting(
      (client, session) => {
        const params: acp.SetSessionConfigOptionRequest =
          typeof value === "boolean"
            ? { sessionId: session.remoteId!, configId, type: "boolean", value }
            : { sessionId: session.remoteId!, configId, value };
        return client.agent.request(acp.methods.agent.session.setConfigOption, params);
      },
      (result, session) => {
        session.configOptions = result.configOptions;
        if (model?.id === configId) {
          const confirmed = result.configOptions.find(
            option =>
              option.id === configId && option.category === "model" && option.type === "select",
          );
          if (confirmed) this.storage.setSetting(`model:${session.agent}`, confirmed.currentValue);
        }
      },
    );
  }
  async cycleMode() {
    // Ignore rapid presses until the agent confirms the previous setting change.
    if (this.settingRequest) return;
    const mode = sessionMode(this.session);
    if (!mode || !mode.options.length)
      throw new Error("This agent does not advertise a mode selector.");
    if (mode.options.length < 2) return;
    const index = mode.options.findIndex(option => option.value === mode.currentValue);
    const next = mode.options[(index + 1) % mode.options.length]!;
    if (mode.configId !== undefined) await this.setConfig(mode.configId, next.value);
    else await this.setMode(String(next.value));
  }
  private async changeSetting<T>(
    request: (client: AgentClient, session: Session) => Promise<T>,
    apply: (result: T, session: Session) => void,
  ) {
    if (this.status !== "ready" || this.settingRequest)
      throw new Error("Wait for the current operation to finish.");
    if (this.closed || !this.client || !this.session.remoteId)
      throw new Error("Connect to an agent before changing settings.");
    const client = this.client,
      session = this.session,
      generation = this.generation;
    const token = (this.settingRequest = Symbol());
    const current = () =>
      !this.closed && generation === this.generation && this.status !== "disconnected";
    try {
      const result = await client.withTimeout(request(client, session));
      if (!current()) return;
      apply(result, session);
      this.publish(true);
    } catch (error) {
      if (current()) throw error;
    } finally {
      if (this.settingRequest === token) this.settingRequest = undefined;
    }
  }
  async authenticate(methodId: string) {
    if (!this.client || this.busy) throw new Error("Connect to an agent first.");
    const generation = this.generation;
    this.status = "connecting";
    this.error = undefined;
    this.publish(true);
    try {
      await this.client.agent.request(acp.methods.agent.authenticate, { methodId });
      if (this.closed || generation !== this.generation) return;
      this.status = "ready";
      await this.open(this.session.remoteId ? this.session : undefined);
    } catch (error) {
      if (this.closed || generation !== this.generation) return;
      this.status = "disconnected";
      this.report(error);
    }
  }
  async exportTranscript() {
    const path = join(this.cwd, `acp-session-${this.session.id.slice(0, 8)}.md`);
    const text = this.session.items
      .map(item =>
        item.type === "message"
          ? `## ${item.role}\n\n${item.text}`
          : `### Tool: ${item.title}\n\nStatus: ${item.status ?? "pending"}`,
      )
      .join("\n\n");
    await Bun.write(path, `# ${this.session.title}\n\n${text}\n`);
    return path;
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.generation++;
    clearTimeout(this.publishTimer);
    clearTimeout(this.saveTimer);
    clearTimeout(this.cancelTimer);
    this.dismissInteractions();
    this.client?.dispose();
    this.persist();
    this.removeAllListeners();
  }
}
