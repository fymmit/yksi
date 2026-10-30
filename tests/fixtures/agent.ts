import * as acp from "@agentclientprotocol/sdk";
import { Readable, Writable } from "node:stream";

const app = acp
  .agent({ name: "test-agent" })
  .onRequest("initialize", async () => {
    if (process.env.SLOW_INIT) await Bun.sleep(60_000);
    return {
      protocolVersion: acp.PROTOCOL_VERSION,
      agentCapabilities: {
        loadSession: true,
        ...(process.env.RESUME ? { sessionCapabilities: { resume: {} } } : {}),
      },
      authMethods: [],
    };
  })
  .onRequest("session/new", () => ({ sessionId: "remote-session" }))
  .onRequest("session/resume", () => ({}))
  .onRequest("session/load", async ctx => {
    for (const [role, text] of [
      ["user_message_chunk", "Original prompt"],
      ["agent_message_chunk", "Authoritative replay"],
    ] as const) {
      await ctx.client.notify("session/update", {
        sessionId: ctx.params.sessionId,
        update: { sessionUpdate: role, content: { type: "text", text } },
      });
    }
    await ctx.client.notify("session/update", {
      sessionId: ctx.params.sessionId,
      update: {
        sessionUpdate: "usage_update",
        used: 500,
        size: 200000,
        cost: { amount: 0.5, currency: "USD" },
      },
    });
    if (process.env.FAIL_LOAD) throw new Error("Fixture load failed after usage replay");
    return {};
  })
  .onRequest("session/prompt", async ctx => {
    const text = ctx.params.prompt[0];
    if (text?.type === "text" && text.text === "crash") process.exit(7);
    if (text?.type === "text" && text.text === "usage") {
      for (const amount of [1, 1, 0.25]) {
        await ctx.client.notify("session/update", {
          sessionId: ctx.params.sessionId,
          update: {
            sessionUpdate: "usage_update",
            used: 1000,
            size: 200000,
            cost: { amount, currency: "USD" },
          },
        });
      }
      await ctx.client.notify("session/update", {
        sessionId: "another-session",
        update: {
          sessionUpdate: "usage_update",
          used: 1,
          size: 200000,
          cost: { amount: 999, currency: "USD" },
        },
      });
      return { stopReason: "end_turn" };
    }
    if (text?.type === "text" && text.text === "questions") {
      const answers = await Promise.all(
        ["First question", "Second question"].map(message =>
          ctx.client.request("elicitation/create", {
            sessionId: ctx.params.sessionId,
            mode: "form",
            message,
            requestedSchema: {
              properties: { name: { type: "string", title: "Name", minLength: 1 } },
              required: ["name"],
            },
          }),
        ),
      );
      await ctx.client.notify("session/update", {
        sessionId: ctx.params.sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: JSON.stringify(answers) },
        },
      });
      return { stopReason: "end_turn" };
    }
    const { terminalId } = await ctx.client.request("terminal/create", {
      sessionId: ctx.params.sessionId,
      command: process.execPath,
      args: ["-e", 'console.log("terminal through ACP")'],
    });
    await ctx.client.notify("session/update", {
      sessionId: ctx.params.sessionId,
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "terminal",
        title: "Run command",
        status: "in_progress",
        content: [{ type: "terminal", terminalId }],
      },
    });
    await ctx.client.request("terminal/wait_for_exit", {
      sessionId: ctx.params.sessionId,
      terminalId,
    });
    const result = await ctx.client.request("terminal/output", {
      sessionId: ctx.params.sessionId,
      terminalId,
    });
    await ctx.client.request("terminal/release", { sessionId: ctx.params.sessionId, terminalId });
    await ctx.client.notify("session/update", {
      sessionId: ctx.params.sessionId,
      update: { sessionUpdate: "tool_call_update", toolCallId: "terminal", status: "completed" },
    });
    await ctx.client.notify("session/update", {
      sessionId: ctx.params.sessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: result.output },
      },
    });
    return { stopReason: "end_turn" };
  });
const connection = app.connect(
  acp.ndJsonStream(
    Writable.toWeb(process.stdout),
    Readable.toWeb(process.stdin) as unknown as ReadableStream<Uint8Array>,
  ),
);
await connection.closed;
