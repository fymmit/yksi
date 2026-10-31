import { expect, spyOn, test } from "bun:test";
import { resolve } from "node:path";
import { Controller, type Snapshot } from "../src/controller";
import { configSchema, demoAgent } from "../src/config";
import { Storage } from "../src/storage";
import { addMessage } from "../src/state";
import type { ClientEvents } from "../src/acp/client";
import * as promptPreparation from "../src/prompt";

function setup() {
  const storage = new Storage(":memory:");
  const definition = demoAgent();
  definition.env.ACP_DEMO_FAST = "1";
  const controller = new Controller(
    configSchema.parse({ defaultAgent: "demo", agents: { demo: definition } }),
    storage,
    resolve(import.meta.dir, ".."),
    "demo",
  );
  return {
    controller,
    dispose: () => {
      controller.dispose();
      storage.close();
    },
  };
}

test("failed saves preserve turns and switched sessions and recover without a retry loop", async () => {
  const { controller, dispose } = setup();
  const save = controller.storage.save.bind(controller.storage);
  const failing = spyOn(controller.storage, "save").mockImplementation(() => {
    throw new Error("disk full");
  });
  try {
    await controller.open();
    await controller.send("/help");
    const first = controller.session.id;
    expect(controller.status).toBe("ready");
    expect(controller.snapshot().persistenceError).toContain("disk full");
    await Bun.sleep(550);
    const attempts = failing.mock.calls.length;
    await Bun.sleep(550);
    expect(failing.mock.calls.length).toBe(attempts);
    await controller.open();
    expect(controller.status).toBe("ready");
    failing.mockImplementation(save);
    await controller.send("/help");
    expect(controller.snapshot().persistenceError).toBeUndefined();
    expect(controller.storage.list(controller.cwd).map(session => session.id)).toContain(first);
  } finally {
    failing.mockRestore();
    dispose();
  }
});

test("disposal removes listeners and dismisses interactions even when final saving fails", async () => {
  const { controller, dispose } = setup();
  await controller.open();
  const asked = new Promise<void>(resolve =>
    controller.on("change", state => {
      if (state.interaction) resolve();
    }),
  );
  const turn = controller.send("/question");
  await asked;
  const failing = spyOn(controller.storage, "save").mockImplementation(() => {
    throw new Error("disk full");
  });
  try {
    expect(() => controller.dispose()).toThrow(AggregateError);
    expect(controller.listenerCount("change")).toBe(0);
    expect(controller.snapshot().interaction).toBeUndefined();
    expect(() => controller.dispose()).not.toThrow();
    await turn;
  } finally {
    failing.mockRestore();
    dispose();
  }
});

test("an unused remote session is not saved while open, on switch, or on exit", async () => {
  const { controller, dispose } = setup();
  try {
    await controller.open();
    expect(controller.status).toBe("ready");
    expect(controller.session.remoteId).toBeTruthy();
    await Bun.sleep(550); // Let the debounced persistence timer run.
    expect(controller.storage.list(controller.cwd)).toEqual([]);

    const firstId = controller.session.id;
    await controller.open();
    expect(controller.session.id).not.toBe(firstId);
    expect(controller.storage.list(controller.cwd)).toEqual([]);

    controller.dispose();
    expect(controller.storage.list(controller.cwd)).toEqual([]);
  } finally {
    dispose();
  }
});

test("local commands, settings, and notices do not save a session without conversation", async () => {
  const { controller, dispose } = setup();
  try {
    await controller.open();
    controller.recordInput("/tui:usage");
    await controller.setMode("plan");
    const events = Reflect.get(controller.client!, "events") as ClientEvents;
    events.update({
      sessionId: controller.session.remoteId!,
      update: { sessionUpdate: "notice", severity: "info", title: "Connected" },
    });
    expect(controller.session.items).toHaveLength(1);
    expect(controller.storage.list(controller.cwd)).toEqual([]);

    await controller.open();
    expect(controller.storage.list(controller.cwd)).toEqual([]);
  } finally {
    dispose();
  }
});

test("the first prompt saves a session, including previously entered local commands", async () => {
  const { controller, dispose } = setup();
  try {
    await controller.open();
    controller.recordInput("/tui:usage");
    await controller.send("/help");
    const saved = controller.storage.list(controller.cwd)[0];
    expect(saved?.id).toBe(controller.session.id);
    expect(saved?.inputHistory).toEqual([
      { text: "/tui:usage", attachments: [] },
      { text: "/help", attachments: [] },
    ]);
    await controller.open();
    expect(controller.storage.list(controller.cwd)).toHaveLength(1);
  } finally {
    dispose();
  }
});

test("stdio handshake, command discovery, permission, streamed tool output and persistence", async () => {
  const { controller, dispose } = setup();
  try {
    let permissions = 0;
    controller.on("change", (state: Snapshot) => {
      if (state.interaction) {
        permissions++;
        controller.answer("allow");
      }
    });
    await controller.open();
    expect(controller.status).toBe("ready");
    expect(controller.session.commands.map(c => c.name)).toContain("question");
    await controller.send("Show me the flow");
    expect(permissions).toBe(1);
    expect(controller.status).toBe("ready");
    expect(
      controller.session.items.some(item => item.type === "tool" && item.status === "completed"),
    ).toBe(true);
    const last = controller.session.items.at(-1);
    expect(last?.type === "message" && last.text.includes("Welcome to yksi")).toBe(true);
    expect(controller.storage.list(controller.cwd)[0]?.items).toEqual(controller.session.items);
    expect(controller.storage.list(controller.cwd)[0]?.inputHistory).toEqual([
      { text: "Show me the flow", attachments: [] },
    ]);
    await controller.setMode("plan");
    expect(controller.session.modes?.currentModeId).toBe("plan");
    await controller.cycleMode();
    expect(
      controller.session.configOptions.find(option => option.category === "mode")?.currentValue,
    ).toBe("code");
    expect(controller.session.modes?.currentModeId).toBe("code");
  } finally {
    dispose();
  }
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
    expect(controller.session.items.at(-1)).toMatchObject({
      role: "system",
      text: "Turn stopped: cancelled",
    });
    await controller.send("/help");
    expect(controller.status).toBe("ready");
  } finally {
    dispose();
  }
}, 15_000);

test("structured input is returned to the agent", async () => {
  const { controller, dispose } = setup();
  try {
    controller.on("change", (state: Snapshot) => {
      if (state.interaction?.form) controller.answer("accept", { name: "Example", tests: true });
    });
    await controller.open();
    await controller.send("/question");
    const last = controller.session.items.at(-1);
    expect(last?.type === "message" && last.text.includes('"name":"Example"')).toBe(true);
  } finally {
    dispose();
  }
});

test("structured question decline and cancel outcomes round trip over ACP", async () => {
  for (const action of ["decline", "cancel"]) {
    const { controller, dispose } = setup();
    try {
      controller.on("change", (state: Snapshot) => {
        if (state.interaction?.form)
          controller.answer(action === "decline" ? "decline" : undefined);
      });
      await controller.open();
      await controller.send("/question");
      const last = controller.session.items.at(-1);
      expect(
        last?.type === "message" && JSON.parse(last.text.replace("Your answer: ", "")),
      ).toEqual({ action });
      expect(controller.snapshot().interaction).toBeUndefined();
    } finally {
      dispose();
    }
  }
});

test("cancelling a turn resolves all queued forms", async () => {
  const { controller, dispose } = setup();
  controller.config.agents.demo!.args = [resolve(import.meta.dir, "fixtures/agent.ts")];
  try {
    const asked = new Promise<void>(resolve => {
      controller.on("change", (state: Snapshot) => {
        if (state.interaction?.form) resolve();
      });
    });
    await controller.open();
    const turn = controller.send("questions");
    await asked;
    await controller.cancel();
    await turn;
    expect(controller.snapshot().interaction).toBeUndefined();
    expect(controller.status).toBe("ready");
    const last = controller.session.items.at(-1);
    expect(last?.type === "message" && JSON.parse(last.text)).toEqual([
      { action: "cancel" },
      { action: "cancel" },
    ]);
  } finally {
    dispose();
  }
});

test("failed remote load preserves a readable local transcript", async () => {
  const { controller, dispose } = setup();
  try {
    await controller.open();
    await controller.send("/help");
    const saved = structuredClone(controller.session);
    await controller.open(saved);
    expect(controller.status).toBe("history");
    expect(controller.session.items).toEqual(saved.items);
    expect(controller.session.inputHistory).toEqual(saved.inputHistory);
    expect(controller.error).toContain("lifetime");
  } finally {
    dispose();
  }
});

test("missing executable produces a recoverable connection error", async () => {
  const { controller, dispose } = setup();
  try {
    controller.config.agents.demo!.command = "/no-such-acp-agent";
    await controller.open();
    expect(controller.status).toBe("disconnected");
    expect(controller.error).toBeTruthy();
  } finally {
    dispose();
  }
});

test("successful session load replaces local history rather than duplicating replay", async () => {
  const { controller, dispose } = setup();
  controller.config.agents.demo!.args = [resolve(import.meta.dir, "fixtures/agent.ts")];
  try {
    await controller.open();
    await controller.send("Run a command");
    controller.recordInput("/tui:usage");
    const inputs = structuredClone(controller.session.inputHistory);
    expect(Object.values(controller.session.terminalOutput ?? {})).toEqual([
      "terminal through ACP\n",
    ]);
    await controller.open(structuredClone(controller.session));
    expect(controller.status).toBe("ready");
    expect(controller.session.items).toHaveLength(2);
    expect(controller.session.items[1]).toMatchObject({
      role: "agent",
      text: "Authoritative replay",
    });
    expect(controller.session.inputHistory).toEqual(inputs);
    expect(controller.storage.list(controller.cwd)[0]?.inputHistory).toEqual(inputs);
  } finally {
    dispose();
  }
});

test("failed attachments are not recorded, successful ones retain their original paths", async () => {
  const { controller, dispose } = setup();
  try {
    await controller.open();
    await controller.send("inspect", ["missing-file-that-does-not-exist"]);
    expect(controller.session.inputHistory).toEqual([]);
    await controller.send("/help", ["package.json"]);
    expect(controller.session.inputHistory).toEqual([
      { text: "/help", attachments: ["package.json"] },
    ]);
    expect(controller.storage.list(controller.cwd)[0]?.inputHistory).toEqual(
      controller.session.inputHistory,
    );
  } finally {
    dispose();
  }
});

test("acceptance happens before turn completion and cancellation during preparation never accepts", async () => {
  const { controller, dispose } = setup();
  try {
    await controller.open();
    let accepted = false;
    const turn = controller.send("/question", [], () => {
      accepted = true;
    });
    while (!controller.snapshot().interaction) await Bun.sleep(5);
    expect(accepted).toBe(true);
    expect(controller.status).toBe("working");
    await controller.cancel();
    await turn;

    let release!: () => void;
    const prepare = spyOn(promptPreparation, "preparePrompt").mockImplementation(async () => {
      await new Promise<void>(resolve => {
        release = resolve;
      });
      return [{ type: "text", text: "never sent" }];
    });
    try {
      accepted = false;
      const history = structuredClone(controller.session.inputHistory);
      const cancelled = controller.send("never sent", [], () => {
        accepted = true;
      });
      await controller.cancel();
      release();
      await cancelled;
      expect(accepted).toBe(false);
      expect(controller.session.inputHistory).toEqual(history);
    } finally {
      prepare.mockRestore();
    }
  } finally {
    dispose();
  }
});

test("the first new submission retains browsable messages from older transcripts", () => {
  const { controller, dispose } = setup();
  try {
    controller.session.inputHistory = undefined;
    addMessage(controller.session, "user", "old message");
    addMessage(controller.session, "agent", "old response");
    controller.recordInput("/tui:usage");
    expect(controller.snapshot().session.inputHistory).toEqual([
      { text: "old message", attachments: [] },
      { text: "/tui:usage", attachments: [] },
    ]);
    expect(controller.storage.list(controller.cwd)[0]?.inputHistory).toEqual(
      controller.snapshot().session.inputHistory,
    );
  } finally {
    dispose();
  }
});

test("agent crash rejects the pending turn and a new session can reconnect", async () => {
  const { controller, dispose } = setup();
  controller.config.agents.demo!.args = [resolve(import.meta.dir, "fixtures/agent.ts")];
  try {
    await controller.open();
    await controller.send("crash");
    expect(controller.status).toBe("disconnected");
    expect(controller.session.items[0]).toMatchObject({ role: "user", text: "crash" });
    await controller.open();
    expect(controller.status).toBe("ready");
  } finally {
    dispose();
  }
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
  } finally {
    dispose();
  }
});

test("ACP costs persist, replay replaces totals, and new sessions reject old connection updates", async () => {
  const { controller, dispose } = setup();
  controller.config.agents.demo!.args = [resolve(import.meta.dir, "fixtures/agent.ts")];
  try {
    await controller.open();
    const oldEvents = Reflect.get(controller.client!, "events") as ClientEvents;
    await controller.send("usage");
    expect(controller.session.usage?.cost).toEqual({ amount: 0.25, currency: "USD" });
    expect(controller.session.usageUpdatedAt).toBeGreaterThan(0);
    const saved = controller.storage.list(controller.cwd)[0]!;
    expect(saved.usage).toEqual(controller.session.usage);
    expect(saved.usageUpdatedAt).toBe(controller.session.usageUpdatedAt);

    await controller.open(saved);
    expect(controller.status).toBe("ready");
    expect(controller.session.usage?.cost?.amount).toBe(0.5);
    expect(controller.session.usageUpdatedAt!).toBeGreaterThanOrEqual(saved.usageUpdatedAt!);

    await controller.open();
    expect(controller.session.usage).toBeUndefined();
    oldEvents.update({
      sessionId: controller.session.remoteId!,
      update: {
        sessionUpdate: "usage_update",
        used: 1,
        size: 200000,
        cost: { amount: 999, currency: "USD" },
      },
    });
    expect(controller.session.usage).toBeUndefined();
    expect(controller.session.usageUpdatedAt).toBeUndefined();

    // A saved local record without a remote ID must also start fresh usage.
    await controller.open({ ...saved, remoteId: undefined });
    expect(controller.status).toBe("ready");
    expect(controller.session.usage).toBeUndefined();
    expect(controller.session.usageUpdatedAt).toBeUndefined();
  } finally {
    dispose();
  }
});

test("failed ACP replay preserves saved usage and receipt time", async () => {
  const { controller, dispose } = setup();
  controller.config.agents.demo!.args = [resolve(import.meta.dir, "fixtures/agent.ts")];
  try {
    await controller.open();
    await controller.send("usage");
    const saved = structuredClone(controller.session);
    controller.config.agents.demo!.env.FAIL_LOAD = "1";
    await controller.open(saved);
    expect(controller.status).toBe("history");
    expect(controller.session.items).toEqual(saved.items);
    expect(controller.session.usage).toEqual(saved.usage);
    expect(controller.session.usageUpdatedAt).toBe(saved.usageUpdatedAt);
  } finally {
    dispose();
  }
});

test("ACP resume retains the last reading until the agent reports usage again", async () => {
  const { controller, dispose } = setup();
  controller.config.agents.demo!.args = [resolve(import.meta.dir, "fixtures/agent.ts")];
  controller.config.agents.demo!.env.RESUME = "1";
  try {
    await controller.open();
    await controller.send("usage");
    const saved = structuredClone(controller.session);
    await controller.open(saved);
    expect(controller.status).toBe("ready");
    expect(controller.session.usage).toEqual(saved.usage);
    expect(controller.session.usageUpdatedAt).toBe(saved.usageUpdatedAt);
    await controller.send("usage");
    expect(controller.session.usage?.cost?.amount).toBe(0.25);
    expect(controller.session.usageUpdatedAt!).toBeGreaterThanOrEqual(saved.usageUpdatedAt!);
  } finally {
    dispose();
  }
});
