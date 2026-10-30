import * as acp from "@agentclientprotocol/sdk";
import { Readable, Writable } from "node:stream";

let current = process.env.DEFAULT_MODEL ?? "default";
let changes = 0;
const configId = process.env.MODEL_CONFIG_ID ?? "engine";
const configOptions = (): acp.SessionConfigOption[] => [
  ...(process.env.NO_MODEL ? [] : [{
    id: configId, name: "Model", category: "model", type: "select" as const, currentValue: current,
    options: [{ group: "models", name: "Models", options: (process.env.MISSING_MODEL ? ["default"] : ["default", "preferred", "other"]).map(value => ({ value, name: value })) }],
  }]),
  { id: "operation", name: "Mode", category: "mode", type: "select", currentValue: String(changes), options: [{ value: String(changes), name: "Dependent mode" }] },
];
const restore = () => { current = "other"; return { configOptions: configOptions() }; };
const app = acp.agent({ name: "models-fixture" })
  .onRequest("initialize", () => ({ protocolVersion: acp.PROTOCOL_VERSION, agentCapabilities: {
    loadSession: true, ...(process.env.RESUME ? { sessionCapabilities: { resume: {} } } : {}),
  }, authMethods: [] }))
  .onRequest("session/new", () => ({ sessionId: "models-session", configOptions: configOptions() }))
  .onRequest("session/load", restore)
  .onRequest("session/resume", restore)
  .onRequest("session/set_config_option", ctx => {
    if (ctx.params.configId === "operation") current = "other";
    else {
      if (ctx.params.configId !== configId) throw new Error("Wrong model selector");
      if (process.env.REJECT_MODEL) throw new acp.RequestError(-32000, "Model change rejected");
      if (process.env.CRASH_MODEL) process.exit(1);
      if (ctx.params.value === current) throw new Error("Redundant model change");
      if (typeof ctx.params.value !== "string" || !["default", "preferred", "other"].includes(ctx.params.value)) throw new Error("Unknown model");
      current = process.env.CONFIRMED_MODEL ?? ctx.params.value;
    }
    changes++;
    return { configOptions: configOptions() };
  })
  .onRequest("session/prompt", async ctx => {
    current = "other";
    await ctx.client.notify("session/update", { sessionId: ctx.params.sessionId, update: { sessionUpdate: "config_option_update", configOptions: configOptions() } });
    return { stopReason: "end_turn" };
  });
const connection = app.connect(acp.ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin) as unknown as ReadableStream<Uint8Array>));
await connection.closed;
