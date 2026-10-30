import * as acp from "@agentclientprotocol/sdk";
import { Readable, Writable } from "node:stream";

// A real stdio ACP agent for offline exploration and protocol integration tests.
const sessions = new Map<string, { history: acp.SessionUpdate[]; cancelled: boolean; cwd: string }>();
const options: acp.SessionConfigOption[] = [{ id: "model", name: "Model", category: "model", type: "select", currentValue: "demo", options: [{ value: "demo", name: "Offline demo" }] }];
const app = acp.agent({ name: "acp-tui-demo" })
  .onRequest("initialize", () => ({ protocolVersion: acp.PROTOCOL_VERSION, agentInfo: { name: "Demo", version: "0.1.0" }, agentCapabilities: { loadSession: true, promptCapabilities: { embeddedContext: true } }, authMethods: [] }))
  .onRequest("session/new", async ctx => {
    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, { history: [], cancelled: false, cwd: ctx.params.cwd });
    await ctx.client.notify("session/update", { sessionId, update: { sessionUpdate: "available_commands_update", availableCommands: [{ name: "help", description: "Explore the demo agent" }, { name: "question", description: "Try a structured question" }, { name: "slow", description: "Try cancelling a long response" }] } });
    return { sessionId, configOptions: options, modes: { currentModeId: "code", availableModes: [{ id: "code", name: "Code" }, { id: "plan", name: "Plan" }] } };
  })
  .onRequest("session/load", async ctx => {
    const session = sessions.get(ctx.params.sessionId);
    if (!session) throw new acp.RequestError(-32001, "Demo sessions last only for the lifetime of the demo process. Local history is still available.");
    for (const update of session.history) await ctx.client.notify("session/update", { sessionId: ctx.params.sessionId, update });
    return { configOptions: options };
  })
  .onRequest("session/set_mode", () => ({}))
  .onRequest("session/set_config_option", () => ({ configOptions: options }))
  .onNotification("session/cancel", ctx => { const session = sessions.get(ctx.params.sessionId); if (session) session.cancelled = true; })
  .onRequest("session/prompt", async ctx => {
    const { sessionId } = ctx.params;
    const session = sessions.get(sessionId)!;
    session.cancelled = false;
    const update = async (event: acp.SessionUpdate) => {
      session.history.push(event);
      await ctx.client.notify("session/update", { sessionId, update: event });
    };
    const text = ctx.params.prompt.filter(c => c.type === "text").map(c => c.text).join("\n");
    session.history.push({ sessionUpdate: "user_message_chunk", content: { type: "text", text } });
    if (text === "/question") {
      const answer = await ctx.client.request("elicitation/create", { sessionId, mode: "form", message: "What would you like to build?", requestedSchema: {
        type: "object",
        properties: {
          name: { type: "string", title: "Project name", minLength: 1 },
          tests: { type: "boolean", title: "Include tests", default: true },
          template: { type: "string", title: "Template", oneOf: [{ const: "cli", title: "Command-line app" }, { const: "web", title: "Web app" }], default: "cli" },
          workers: { type: "integer", title: "Workers", minimum: 1, maximum: 8, default: 1 },
          extras: { type: "array", title: "Project extras", items: { anyOf: [{ const: "docs", title: "Documentation" }, { const: "ci", title: "Continuous integration" }] }, maxItems: 2 },
          notes: { type: "string", title: "Notes", description: "Optional instructions for this demo project." },
        },
        required: ["name"],
      } });
      await update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: `Your answer: ${JSON.stringify(answer)}` } });
      return { stopReason: session.cancelled ? "cancelled" : "end_turn" };
    }
    if (text !== "/slow" && text !== "/help") {
      await update({ sessionUpdate: "plan", entries: [{ content: "Show a simulated code change", priority: "medium", status: "in_progress" }] });
      const toolCallId = crypto.randomUUID();
      const diff: acp.ToolCallContent = { type: "diff", path: `${session.cwd}/hello.ts`, oldText: 'console.log("Hello");\n', newText: 'console.log("Hello, ACP!");\n' };
      await update({ sessionUpdate: "tool_call", toolCallId, title: "Preview hello.ts (simulation)", kind: "edit", status: "pending", content: [diff] });
      const permission = await ctx.client.request("session/request_permission", { sessionId, toolCall: { toolCallId, title: "Show this simulated edit?", content: [diff] }, options: [{ optionId: "allow", name: "Allow once", kind: "allow_once" }, { optionId: "reject", name: "Reject", kind: "reject_once" }] });
      const allowed = permission.outcome.outcome === "selected" && permission.outcome.optionId === "allow";
      await update({ sessionUpdate: "tool_call_update", toolCallId, status: allowed ? "completed" : "failed" });
      await update({ sessionUpdate: "plan", entries: [{ content: "Show a simulated code change", priority: "medium", status: "completed" }] });
    }
    const response = text === "/slow" ? "Streaming a longer response so you can try cancelling the turn. ".repeat(80) : "## Welcome to ACP TUI\n\nThis is a real ACP connection to an **offline demo agent**. No files were changed.\n\n- Open the command palette to discover actions and your configured shortcuts.\n- Use **Expand / collapse tool details** to inspect output and diffs.\n- Try `/question` for structured input or `/slow` to test cancellation.\n- Use **Switch agent** to select Copilot when you're ready to code.\n\n```typescript\nconst greeting = \"Hello, ACP!\";\nconsole.log(greeting);\n```\n";
    for (const chunk of response.match(/.{1,18}|\n/g) ?? []) {
      if (session.cancelled) return { stopReason: "cancelled" };
      await update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: chunk } });
      await Bun.sleep(process.env.ACP_DEMO_FAST ? 1 : 25);
    }
    return { stopReason: "end_turn" };
  });

const connection = app.connect(acp.ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin) as unknown as ReadableStream<Uint8Array>));
await connection.closed;
