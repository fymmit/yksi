import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { Controller } from "../src/controller";
import { demoAgent } from "../src/config";
import { sessionMode } from "../src/modes";
import { Storage } from "../src/storage";
import { newSession } from "../src/state";

function setup(env: Record<string, string> = {}) {
  const storage = new Storage(":memory:");
  const agent = { ...demoAgent(), args: [resolve(import.meta.dir, "fixtures/modes-agent.ts")], env };
  const controller = new Controller({ defaultAgent: "test", agents: { test: agent } }, storage, resolve(import.meta.dir, ".."), "test");
  return { controller, dispose: () => { controller.dispose(); storage.close(); } };
}

test("mode discovery uses semantic categories and ignores legacy modes when config options exist", () => {
  const session = newSession("test", "/project");
  expect(sessionMode(session)).toBeUndefined();
  session.modes = { currentModeId: "plan", availableModes: [{ id: "plan", name: "Plan" }] };
  expect(sessionMode(session)?.currentValue).toBe("plan");
  session.configOptions = [{ id: "mode", name: "Mode", type: "select", currentValue: "ask", options: [] }];
  expect(sessionMode(session)).toBeUndefined();
  session.configOptions[0]!.category = "_custom";
  expect(sessionMode(session)).toBeUndefined();
});

for (const api of ["config", "legacy"]) test(`${api} modes cycle, wrap, and follow agent-initiated changes`, async () => {
  const { controller, dispose } = setup({ MODE_API: api });
  try {
    await controller.open();
    expect(sessionMode(controller.session)?.currentValue).toBe("ask");
    await controller.cycleMode();
    expect(sessionMode(controller.session)?.currentValue).toBe("plan");
    await controller.cycleMode();
    expect(sessionMode(controller.session)?.currentValue).toBe("code");
    await controller.cycleMode();
    expect(sessionMode(controller.session)?.currentValue).toBe("ask");
    if (api === "config") {
      expect(controller.session.configOptions[0]?.currentValue).toBe("3");
      expect(controller.session.configOptions[2]?.currentValue).toBe("other");
    }
    await controller.send("change mode");
    expect(sessionMode(controller.session)?.currentValue).toBe("code");
    await controller.cycleMode();
    expect(sessionMode(controller.session)?.currentValue).toBe("ask");
  } finally { dispose(); }
});

test("boolean mode selectors send typed ACP requests", async () => {
  const { controller, dispose } = setup({ MODE_API: "boolean" });
  try {
    await controller.open();
    await controller.cycleMode();
    expect(sessionMode(controller.session)?.currentValue).toBe(true);
    await controller.cycleMode();
    expect(sessionMode(controller.session)?.currentValue).toBe(false);
  } finally { dispose(); }
});

test("rapid mode presses wait for confirmation and single-choice selectors do not send changes", async () => {
  const { controller, dispose } = setup({ SLOW_MODE: "1" });
  try {
    await controller.open();
    await Promise.all([controller.cycleMode(), controller.cycleMode(), controller.cycleMode()]);
    expect(controller.session.configOptions[0]?.currentValue).toBe("1");
    expect(sessionMode(controller.session)?.currentValue).toBe("plan");
    controller.session.configOptions = [{ id: "single", name: "Mode", category: "mode", type: "select", currentValue: "only", options: [{ value: "only", name: "Only" }] }];
    await controller.cycleMode(); // The fixture rejects any request to this selector.
    expect(sessionMode(controller.session)?.currentValue).toBe("only");
  } finally { dispose(); }
});

test("rejected mode changes preserve the confirmed value and can be retried", async () => {
  const { controller, dispose } = setup({ REJECT_MODE: "1" });
  try {
    await controller.open();
    for (let i = 0; i < 2; i++) {
      await expect(controller.cycleMode()).rejects.toThrow("Mode change rejected");
      expect(sessionMode(controller.session)?.currentValue).toBe("ask");
    }
    controller.status = "working";
    await expect(controller.cycleMode()).rejects.toThrow("Wait for the current operation");
    controller.status = "disconnected";
    await expect(controller.cycleMode()).rejects.toThrow("Wait for the current operation");
  } finally { dispose(); }
});

test("switching sessions discards in-flight setting results and releases the new session's controls", async () => {
  const { controller, dispose } = setup({ SLOW_MODE: "1" });
  try {
    await controller.open();
    const changing = controller.cycleMode();
    await controller.open();
    await changing;
    expect(controller.error).toBeUndefined();
    expect(sessionMode(controller.session)?.currentValue).toBe("ask");
    await controller.cycleMode();
    expect(sessionMode(controller.session)?.currentValue).toBe("plan");
  } finally { dispose(); }
});

for (const api of ["config", "legacy"]) test(`late successful ${api} mode responses cannot mutate a replaced session`, async () => {
  const { controller, dispose } = setup({ MODE_API: api });
  const arrived = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  try {
    await controller.open();
    const previous = controller.session;
    controller.client!.withTimeout = async <T>(promise: Promise<T>) => {
      const result = await promise;
      arrived.resolve();
      await release.promise;
      return result;
    };
    const changing = controller.cycleMode();
    await arrived.promise;
    await controller.open();
    release.resolve();
    await changing;
    expect(sessionMode(previous)?.currentValue).toBe("ask");
    expect(sessionMode(controller.session)?.currentValue).toBe("ask");
    expect(controller.error).toBeUndefined();
    await controller.cycleMode();
    expect(sessionMode(controller.session)?.currentValue).toBe("plan");
  } finally { release.resolve(); dispose(); }
});

test("missing and empty selectors report unavailability; an unknown current value starts at the first choice", async () => {
  const { controller, dispose } = setup();
  try {
    await expect(controller.cycleMode()).rejects.toThrow("does not advertise");
    await controller.open();
    controller.session.configOptions[1]!.currentValue = "removed";
    await controller.cycleMode();
    expect(sessionMode(controller.session)?.currentValue).toBe("ask");
    controller.session.configOptions = [{ id: "empty", name: "Mode", category: "mode", type: "select", currentValue: "", options: [] }];
    await expect(controller.cycleMode()).rejects.toThrow("does not advertise");
  } finally { dispose(); }
});
