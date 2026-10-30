import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Controller, type Snapshot } from "../src/controller";
import { configSchema, demoAgent } from "../src/config";
import { Storage } from "../src/storage";

function setup(
  env: Record<string, string> = {},
  path = ":memory:",
  cwd = resolve(import.meta.dir, ".."),
) {
  const storage = new Storage(path);
  const agent = {
    ...demoAgent(),
    args: [resolve(import.meta.dir, "fixtures/models-agent.ts")],
    env,
  };
  const controller = new Controller(
    configSchema.parse({ defaultAgent: "test", agents: { test: agent, second: agent } }),
    storage,
    cwd,
    "test",
  );
  return {
    controller,
    storage,
    dispose: () => {
      controller.dispose();
      storage.close();
    },
  };
}
function model(controller: Controller) {
  return controller.session.configOptions.find(option => option.category === "model")?.currentValue;
}

test("confirmed model choices restore before new sessions become ready, with replacement settings", async () => {
  const { controller, storage, dispose } = setup();
  try {
    await controller.open();
    expect(model(controller)).toBe("default");
    expect(storage.setting("model:test", null)).toBeNull();
    await controller.setConfig("engine", "preferred");
    expect(storage.setting("model:test", "")).toBe("preferred");
    const readyModels: unknown[] = [];
    controller.on("change", (snapshot: Snapshot) => {
      if (snapshot.status === "ready")
        readyModels.push(
          snapshot.session.configOptions.find(option => option.category === "model")?.currentValue,
        );
    });
    // Selector IDs may change between sessions; the category and choice value are authoritative.
    controller.config.agents.test!.env.MODEL_CONFIG_ID = "new-engine";
    await controller.open();
    expect(controller.status).toBe("ready");
    expect(controller.error).toBeUndefined();
    expect(readyModels).toEqual(["preferred"]);
    expect(
      controller.session.configOptions.find(option => option.id === "operation")?.currentValue,
    ).toBe("1");
  } finally {
    dispose();
  }
});

test("model preferences survive storage reopening and apply across projects, scoped per agent", async () => {
  const directory = mkdtempSync(join(tmpdir(), "acp-models-"));
  const path = join(directory, "history.sqlite");
  try {
    const first = setup({}, path);
    try {
      await first.controller.open();
      await first.controller.setConfig("engine", "preferred");
    } finally {
      first.dispose();
    }
    const second = setup({}, path, directory);
    try {
      await second.controller.open();
      expect(model(second.controller)).toBe("preferred");
      await second.controller.open(undefined, "second");
      expect(model(second.controller)).toBe("default");
      await second.controller.setConfig("engine", "other");
      await second.controller.open(undefined, "test");
      expect(model(second.controller)).toBe("preferred");
      await second.controller.open(undefined, "second");
      expect(model(second.controller)).toBe("other");
    } finally {
      second.dispose();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("only explicit confirmed model changes update the preference", async () => {
  const { controller, storage, dispose } = setup();
  try {
    await controller.open();
    await controller.setConfig("engine", "preferred");
    await controller.setConfig("operation", "1");
    expect(model(controller)).toBe("other");
    expect(storage.setting("model:test", "")).toBe("preferred");
    await controller.send("agent changes model");
    expect(storage.setting("model:test", "")).toBe("preferred");
    controller.config.agents.test!.env.REJECT_MODEL = "1";
    await controller.open();
    await expect(controller.setConfig("engine", "other")).rejects.toThrow("Model change rejected");
    expect(storage.setting("model:test", "")).toBe("preferred");
    expect(model(controller)).toBe("default");
  } finally {
    dispose();
  }
});

test("model preferences use the agent-confirmed value", async () => {
  const { controller, storage, dispose } = setup({ CONFIRMED_MODEL: "other" });
  try {
    await controller.open();
    await controller.setConfig("engine", "preferred");
    expect(model(controller)).toBe("other");
    expect(storage.setting("model:test", "")).toBe("other");
  } finally {
    dispose();
  }
});

for (const resume of [false, true])
  test(`${resume ? "resume" : "load"} retains the remote session model without changing the preference`, async () => {
    const { controller, storage, dispose } = setup(resume ? { RESUME: "1" } : {});
    try {
      await controller.open();
      await controller.setConfig("engine", "preferred");
      await controller.open(structuredClone(controller.session));
      expect(controller.status).toBe("ready");
      expect(model(controller)).toBe("other");
      expect(storage.setting("model:test", "")).toBe("preferred");
      await controller.open();
      expect(model(controller)).toBe("preferred");
    } finally {
      dispose();
    }
  });

for (const flag of ["MISSING_MODEL", "NO_MODEL", "REJECT_MODEL", "CONFIRMED_MODEL"]) {
  test(`model restoration failure stays usable and preserves the preference: ${flag}`, async () => {
    const { controller, storage, dispose } = setup({
      [flag]: flag === "CONFIRMED_MODEL" ? "other" : "1",
    });
    try {
      storage.setSetting("model:test", "preferred");
      await controller.open();
      expect(controller.status).toBe("ready");
      expect(controller.error).toContain('"preferred"');
      expect(controller.error).toContain("using the agent's");
      expect(storage.setting("model:test", "")).toBe("preferred");
      await controller.send("still usable");
      delete controller.config.agents.test!.env.MISSING_MODEL;
      delete controller.config.agents.test!.env.NO_MODEL;
      delete controller.config.agents.test!.env.REJECT_MODEL;
      delete controller.config.agents.test!.env.CONFIRMED_MODEL;
      await controller.open();
      expect(model(controller)).toBe("preferred");
      expect(controller.error).toBeUndefined();
    } finally {
      dispose();
    }
  });
}

test("a matching agent default does not send a redundant model change", async () => {
  const { controller, storage, dispose } = setup({ DEFAULT_MODEL: "preferred" });
  try {
    storage.setSetting("model:test", "preferred");
    await controller.open();
    expect(controller.status).toBe("ready");
    expect(controller.error).toBeUndefined();
    expect(
      controller.session.configOptions.find(option => option.id === "operation")?.currentValue,
    ).toBe("0");
  } finally {
    dispose();
  }
});

test("late successful model choices cannot change a replacement session or its preference", async () => {
  const { controller, storage, dispose } = setup();
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
    const changing = controller.setConfig("engine", "preferred");
    await arrived.promise;
    await controller.open();
    await controller.setConfig("engine", "other");
    release.resolve();
    await changing;
    expect(previous.configOptions[0]?.currentValue).toBe("default");
    expect(model(controller)).toBe("other");
    expect(storage.setting("model:test", "")).toBe("other");
    expect(controller.error).toBeUndefined();
  } finally {
    release.resolve();
    dispose();
  }
});

test("cancelling pending model restoration discards its late result after a session switch", async () => {
  const { controller, storage, dispose } = setup();
  const arrived = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  try {
    storage.setSetting("model:test", "preferred");
    const opening = controller.open();
    // Hold only the model response, after the real ACP agent has processed it.
    const client = controller.client!;
    client.withTimeout = async <T>(promise: Promise<T>) => {
      const result = await promise;
      if (
        typeof result === "object" &&
        result &&
        "configOptions" in result &&
        !("sessionId" in result)
      ) {
        arrived.resolve();
        await release.promise;
      }
      return result;
    };
    await arrived.promise;
    expect(controller.status).toBe("connecting");
    await expect(controller.send("too early")).rejects.toThrow("Connect to an agent");
    await controller.cancel();
    await controller.open(undefined, "second");
    release.resolve();
    await opening;
    expect(controller.status).toBe("ready");
    expect(model(controller)).toBe("default");
    expect(controller.error).toBeUndefined();
    expect(storage.setting("model:test", "")).toBe("preferred");
    expect(storage.setting("model:second", null)).toBeNull();
  } finally {
    release.resolve();
    dispose();
  }
});

test("a disconnect while restoring a model cannot mark the session ready", async () => {
  const { controller, storage, dispose } = setup({ CRASH_MODEL: "1" });
  try {
    storage.setSetting("model:test", "preferred");
    await controller.open();
    expect(controller.status).toBe("disconnected");
    expect(controller.error).toBeTruthy();
    expect(storage.setting("model:test", "")).toBe("preferred");
  } finally {
    dispose();
  }
});
