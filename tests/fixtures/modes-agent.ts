import * as acp from "@agentclientprotocol/sdk";
import { Readable, Writable } from "node:stream";

let current = "ask";
let changes = 0;
const modes = [
  { id: "ask", name: "Ask" },
  { id: "plan", name: "Plan" },
  { id: "code", name: "Code" },
];
const configOptions = (): acp.SessionConfigOption[] => [
  {
    id: "model",
    name: "Model",
    category: "model",
    type: "select",
    currentValue: String(changes),
    options: [{ value: String(changes), name: "Dependent model" }],
  },
  process.env.MODE_API === "boolean"
    ? {
        id: "operation",
        name: "Mode",
        category: "mode",
        type: "boolean",
        currentValue: current === "code",
      }
    : {
        id: "operation",
        name: "Mode",
        category: "mode",
        type: "select",
        currentValue: current,
        options: [
          {
            group: "read",
            name: "Read",
            options: modes.slice(0, 2).map(mode => ({ value: mode.id, name: mode.name })),
          },
          { group: "write", name: "Write", options: [{ value: "code", name: "Code" }] },
        ],
      },
  {
    id: "secondary",
    name: "Secondary mode",
    category: "mode",
    type: "select",
    currentValue: "other",
    options: [{ value: "other", name: "Other" }],
  },
];
const app = acp
  .agent({ name: "modes-fixture" })
  .onRequest("initialize", () => ({
    protocolVersion: acp.PROTOCOL_VERSION,
    agentCapabilities: {},
    authMethods: [],
  }))
  .onRequest("session/new", () => ({
    sessionId: "modes-session",
    modes: { currentModeId: current, availableModes: modes },
    ...(process.env.MODE_API === "legacy" ? {} : { configOptions: configOptions() }),
  }))
  .onRequest("session/set_mode", ctx => {
    if (process.env.MODE_API !== "legacy") throw new Error("Use config options instead");
    if (!modes.some(mode => mode.id === ctx.params.modeId)) throw new Error("Unknown mode");
    current = ctx.params.modeId;
    return {};
  })
  .onRequest("session/set_config_option", async ctx => {
    if (ctx.params.configId !== "operation") throw new Error("Wrong mode selector");
    if (process.env.REJECT_MODE) throw new acp.RequestError(-32000, "Mode change rejected");
    if (process.env.SLOW_MODE) await Bun.sleep(200);
    if (process.env.MODE_API === "boolean") {
      if (
        !("type" in ctx.params) ||
        ctx.params.type !== "boolean" ||
        typeof ctx.params.value !== "boolean"
      )
        throw new Error("Expected boolean request");
      current = ctx.params.value ? "code" : "ask";
    } else {
      if (typeof ctx.params.value !== "string" || !modes.some(mode => mode.id === ctx.params.value))
        throw new Error("Unknown mode");
      current = ctx.params.value;
    }
    changes++;
    return { configOptions: configOptions() };
  })
  .onRequest("session/prompt", async ctx => {
    current = "code";
    await ctx.client.notify("session/update", {
      sessionId: ctx.params.sessionId,
      update:
        process.env.MODE_API === "legacy"
          ? { sessionUpdate: "current_mode_update", currentModeId: current }
          : { sessionUpdate: "config_option_update", configOptions: configOptions() },
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
