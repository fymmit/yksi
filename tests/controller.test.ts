import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { Controller, type Snapshot } from "../src/controller";
import { demoAgent } from "../src/config";
import { Storage } from "../src/storage";

function setup() {
  const storage = new Storage(":memory:");
  const definition = demoAgent();
  definition.env.ACP_DEMO_FAST = "1";
  const controller = new Controller({ defaultAgent: "demo", agents: { demo: definition } }, storage, resolve(import.meta.dir, ".."), "demo");
  return { controller, dispose: () => { controller.dispose(); storage.close(); } };
}

test("stdio handshake, command discovery, permission, streamed tool output and persistence", async () => {
  const { controller, dispose } = setup();
  try {
    let permissions = 0;
    controller.on("change", (state: Snapshot) => {
      if (state.interaction) { permissions++; controller.answer("allow"); }
    });
    await controller.open();
    expect(controller.status).toBe("ready");
    expect(controller.session.commands.map(c => c.name)).toContain("question");
    await controller.send("Show me the flow");
    expect(permissions).toBe(1);
    expect(controller.status).toBe("ready");
    expect(controller.session.items.some(item => item.type === "tool" && item.status === "completed")).toBe(true);
    const last = controller.session.items.at(-1);
    expect(last?.type === "message" && last.text.includes("Welcome to ACP TUI")).toBe(true);
    expect(controller.storage.list(controller.cwd)[0]?.items).toEqual(controller.session.items);
    await controller.setMode("plan");
    expect(controller.session.modes?.currentModeId).toBe("plan");
  } finally { dispose(); }
}, 15_000);

test("cancellation resolves an outstanding permission and allows the next turn", async () => {
  const { controller, dispose } = setup();
  try {
    controller.on("change", (state: Snapshot) => {
      if (state.interaction) void controller.cancel();
    });
    await controller.open();
    await controller.send("Show me a permission");
    expect(controller.snapshot().interaction).toBeUndefined();
    expect(controller.status).toBe("ready");
    expect(controller.session.items.at(-1)).toMatchObject({ role: "system", text: "Turn stopped: cancelled" });
    await controller.send("/help");
    expect(controller.status).toBe("ready");
  } finally { dispose(); }
}, 15_000);

test("structured input is returned to the agent", async () => {
  const { controller, dispose } = setup();
  try {
    controller.on("change", (state: Snapshot) => { if (state.interaction?.form) controller.answer("accept", { name: "Example", tests: true }); });
    await controller.open();
    await controller.send("/question");
    const last = controller.session.items.at(-1);
    expect(last?.type === "message" && last.text.includes('"name":"Example"')).toBe(true);
  } finally { dispose(); }
});

test("structured question decline and cancel outcomes round trip over ACP", async () => {
  for (const action of ["decline", "cancel"]) {
    const { controller, dispose } = setup();
    try {
      controller.on("change", (state: Snapshot) => { if (state.interaction?.form) controller.answer(action === "decline" ? "decline" : undefined); });
      await controller.open();
      await controller.send("/question");
      const last = controller.session.items.at(-1);
      expect(last?.type === "message" && JSON.parse(last.text.replace("Your answer: ", ""))).toEqual({ action });
      expect(controller.snapshot().interaction).toBeUndefined();
    } finally { dispose(); }
  }
});

test("cancelling a turn resolves all queued forms", async () => {
  const { controller, dispose } = setup();
  controller.config.agents.demo!.args = [resolve(import.meta.dir, "fixtures/agent.ts")];
  try {
    const asked = new Promise<void>(resolve => {
      controller.on("change", (state: Snapshot) => { if (state.interaction?.form) resolve(); });
    });
    await controller.open();
    const turn = controller.send("questions");
    await asked;
    await controller.cancel();
    await turn;
    expect(controller.snapshot().interaction).toBeUndefined();
    expect(controller.status).toBe("ready");
    const last = controller.session.items.at(-1);
    expect(last?.type === "message" && JSON.parse(last.text)).toEqual([{ action: "cancel" }, { action: "cancel" }]);
  } finally { dispose(); }
});

test("failed remote load preserves a readable local transcript", async () => {
  const { controller, dispose } = setup();
  try {
    await controller.open(); await controller.send("/help");
    const saved = structuredClone(controller.session);
    await controller.open(saved);
    expect(controller.status).toBe("history");
    expect(controller.session.items).toEqual(saved.items);
    expect(controller.error).toContain("lifetime");
  } finally { dispose(); }
});

test("missing executable produces a recoverable connection error", async () => {
  const { controller, dispose } = setup();
  try {
    controller.config.agents.demo!.command = "/no-such-acp-agent";
    await controller.open();
    expect(controller.status).toBe("disconnected");
    expect(controller.error).toBeTruthy();
  } finally { dispose(); }
});

test("successful session load replaces local history rather than duplicating replay", async () => {
  const { controller, dispose } = setup();
  controller.config.agents.demo!.args = [resolve(import.meta.dir, "fixtures/agent.ts")];
  try {
    await controller.open();
    await controller.send("Run a command");
    expect(Object.values(controller.session.terminalOutput ?? {})).toEqual(["terminal through ACP\n"]);
    await controller.open(structuredClone(controller.session));
    expect(controller.status).toBe("ready");
    expect(controller.session.items).toHaveLength(2);
    expect(controller.session.items[1]).toMatchObject({ role: "agent", text: "Authoritative replay" });
  } finally { dispose(); }
});

test("agent crash rejects the pending turn and a new session can reconnect", async () => {
  const { controller, dispose } = setup();
  controller.config.agents.demo!.args = [resolve(import.meta.dir, "fixtures/agent.ts")];
  try {
    await controller.open(); await controller.send("crash");
    expect(controller.status).toBe("disconnected");
    expect(controller.session.items[0]).toMatchObject({ role: "user", text: "crash" });
    await controller.open();
    expect(controller.status).toBe("ready");
  } finally { dispose(); }
});

test("cancelling initialization does not let a stale connection overwrite its replacement", async () => {
  const { controller, dispose } = setup();
  controller.config.agents.demo!.args = [resolve(import.meta.dir, "fixtures/agent.ts")];
  controller.config.agents.demo!.env.SLOW_INIT = "1";
  try {
    const opening = controller.open();
    await controller.cancel();
    delete controller.config.agents.demo!.env.SLOW_INIT;
    await controller.open();
    await opening;
    expect(controller.status).toBe("ready");
    expect(controller.error).toBeUndefined();
  } finally { dispose(); }
});
