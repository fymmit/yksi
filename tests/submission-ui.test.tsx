import { expect, spyOn, test } from "bun:test";
import { testRender } from "@opentui/solid";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { App } from "../src/ui/app";
import { Controller } from "../src/controller";
import { Storage } from "../src/storage";
import { configSchema, demoAgent } from "../src/config";
import * as preparation from "../src/prompt";

test("attachment rejection preserves composer text and selection", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "yksi-submit-"));
  const storage = new Storage(":memory:");
  const definition = demoAgent();
  const controller = new Controller(
    configSchema.parse({ agents: { demo: definition } }),
    storage,
    cwd,
    "demo",
  );
  await controller.open();
  const setup = await testRender(
    () => <App controller={controller} storage={storage} quit={() => {}} autoConnect={false} />,
    { width: 100, height: 30 },
  );
  try {
    for (const failure of ["missing", "binary", "large"]) {
      const path = `${failure}.txt`;
      await Bun.write(join(cwd, path), "file");
      await setup.renderOnce();
      setup.mockInput.pressKey("x", { ctrl: true });
      setup.mockInput.pressKey("f");
      for (let i = 0; i < 100; i++) {
        await setup.renderOnce();
        if (setup.captureCharFrame().includes("Attach a text file")) break;
        await Bun.sleep(5);
      }
      await setup.mockInput.typeText(path);
      setup.mockInput.pressEnter();
      await setup.renderOnce();
      if (failure === "missing") await rm(join(cwd, path));
      else
        await Bun.write(join(cwd, path), failure === "binary" ? "\0" : "x".repeat(1024 * 1024 + 1));
      await setup.mockInput.typeText("keep this draft");
      setup.mockInput.pressEnter();
      await Bun.sleep(25);
      await setup.renderOnce();
      expect(setup.captureCharFrame()).toContain("keep this draft");
      expect(setup.captureCharFrame()).toContain(`Attached: ${path}`);
      expect(controller.session.inputHistory).toEqual([]);
      // Remove this selection and text through the normal command path.
      setup.mockInput.pressKey("a", { ctrl: true });
      setup.mockInput.pressKey("k", { ctrl: true });
      await setup.mockInput.typeText("/tui:clear-attachments");
      setup.mockInput.pressEnter();
      await setup.renderOnce();
      controller.session.inputHistory = [];
    }
  } finally {
    controller.dispose();
    await setup.dispose();
    storage.close();
    await rm(cwd, { recursive: true, force: true });
  }
});

test("delayed acceptance preserves edits made during preparation", async () => {
  const storage = new Storage(":memory:");
  const controller = new Controller(
    configSchema.parse({ agents: { demo: demoAgent() } }),
    storage,
    process.cwd(),
    "demo",
  );
  await controller.open();
  let release!: () => void;
  const prepare = spyOn(preparation, "preparePrompt").mockImplementation(async () => {
    await new Promise<void>(resolve => {
      release = resolve;
    });
    return [{ type: "text", text: "/question" }];
  });
  const setup = await testRender(
    () => <App controller={controller} storage={storage} quit={() => {}} autoConnect={false} />,
    { width: 80, height: 30 },
  );
  try {
    await setup.renderOnce();
    await setup.mockInput.typeText("original");
    setup.mockInput.pressEnter();
    await setup.mockInput.typeText(" edited");
    release();
    while (!controller.snapshot().interaction) await Bun.sleep(5);
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("original edited");
    expect(controller.session.inputHistory?.[0]?.text).toBe("original");
    await controller.cancel();
  } finally {
    prepare.mockRestore();
    controller.dispose();
    await setup.dispose();
    storage.close();
  }
});
