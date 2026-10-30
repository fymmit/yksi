import { expect, test } from "bun:test";
import { testRender } from "@opentui/solid";
import { App } from "../src/ui/app";
import { Controller } from "../src/controller";
import { Storage } from "../src/storage";
import { configSchema, demoAgent } from "../src/config";
import { resolve } from "node:path";
import { applyUpdate } from "../src/state";

async function waitForWorkerFrame(setup: Awaited<ReturnType<typeof testRender>>, predicate: (frame: string) => boolean) {
  // OpenTUI's waitForFrame exits when rendering is idle, even if a worker is still starting.
  const deadline = Date.now() + 3000;
  do {
    await setup.renderOnce();
    if (predicate(setup.captureCharFrame())) return;
    await Bun.sleep(10);
  } while (Date.now() < deadline);
  throw new Error(`Highlight worker did not render expected content:\n${setup.captureCharFrame()}`);
}

test("keyboard palette preserves the draft, filters and closes; narrow layout keeps composer", async () => {
  const storage = new Storage(":memory:");
  const controller = new Controller(configSchema.parse({}), storage, "/project", "copilot");
  const setup = await testRender(() => <App controller={controller} quit={() => {}} autoConnect={false} />, { width: 110, height: 35 });
  try {
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("What would you like to build?");
    await setup.mockInput.typeText("Keep this draft");
    setup.mockInput.pressKey("p", { ctrl: true });
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Command palette");
    await setup.mockInput.typeText("Toggle light");
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Toggle light / dark theme");
    setup.mockInput.pressEnter();
    await setup.renderOnce();
    expect(storage.setting("theme", "dark")).toBe("light");
    expect(setup.captureCharFrame()).toContain("Keep this draft");
    expect(setup.captureCharFrame()).not.toContain("Command palette");
    setup.resize(60, 20);
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Keep this draft");
    expect(setup.captureCharFrame()).toContain("Enter send");
  } finally { controller.dispose(); await setup.dispose(); storage.close(); }
});

test("reactive streaming and expanded diffs render after initial mount", async () => {
  const storage = new Storage(":memory:");
  const controller = new Controller(configSchema.parse({}), storage, "/project", "copilot");
  const setup = await testRender(() => <App controller={controller} quit={() => {}} autoConnect={false} />, { width: 100, height: 35 });
  try {
    await setup.renderOnce();
    applyUpdate(controller.session, { sessionUpdate: "tool_call", toolCallId: "edit", title: "Edit greeting", status: "completed", content: [{ type: "diff", path: "/project/a.ts", oldText: "hello\n", newText: "goodbye\n" }] });
    applyUpdate(controller.session, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "First chunk" } });
    controller.emit("change", controller.snapshot());
    // Tree-sitter highlighting runs in a worker, independently of renderer flushes.
    await waitForWorkerFrame(setup, frame => frame.includes("First chunk"));
    applyUpdate(controller.session, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: " and second chunk." } });
    controller.emit("change", controller.snapshot());
    setup.mockInput.pressKey("o", { ctrl: true });
    await waitForWorkerFrame(setup, frame => frame.includes("goodbye") && frame.includes("First chunk and second chunk."));
    expect(setup.captureCharFrame()).toContain("First chunk and second chunk.");
    expect(setup.captureCharFrame()).toContain("goodbye");
  } finally { controller.dispose(); await setup.dispose(); storage.close(); }
});

test("composer submits the editor buffer when text and Enter arrive together", async () => {
  const storage = new Storage(":memory:");
  const controller = new Controller(configSchema.parse({}), storage, "/project", "copilot");
  controller.status = "ready";
  const prompts: string[] = [];
  controller.send = async text => { prompts.push(text); };
  const setup = await testRender(() => <App controller={controller} quit={() => {}} autoConnect={false} />, { width: 80, height: 24 });
  try {
    await setup.renderOnce();
    await setup.mockInput.pressKeys(["h", "e", "l", "l", "o", "RETURN"], 0);
    await setup.renderOnce();
    expect(prompts).toEqual(["hello"]);
  } finally { controller.dispose(); await setup.dispose(); storage.close(); }
});

test("offline demo form accepts keyboard answers without consuming the composer draft", async () => {
  const storage = new Storage(":memory:");
  const definition = demoAgent();
  definition.env.ACP_DEMO_FAST = "1";
  const controller = new Controller({ defaultAgent: "demo", agents: { demo: definition } }, storage, resolve(import.meta.dir, ".."), "demo");
  const setup = await testRender(() => <App controller={controller} quit={() => {}} autoConnect={false} />, { width: 80, height: 30, kittyKeyboard: true });
  try {
    await controller.open();
    await setup.renderOnce();
    await setup.mockInput.typeText("Keep my draft");
    const turn = controller.send("/question");
    await waitForWorkerFrame(setup, frame => frame.includes("Project name *"));
    await setup.mockInput.typeText("keyboard-project");
    setup.mockInput.pressEnter();
    setup.mockInput.pressArrow("down");
    setup.mockInput.pressEnter();
    setup.mockInput.pressArrow("down");
    setup.mockInput.pressEnter();
    setup.mockInput.pressEnter();
    setup.mockInput.pressKey("u", { ctrl: true });
    await turn;
    await setup.renderOnce();
    const last = controller.session.items.at(-1);
    expect(last?.type === "message" && JSON.parse(last.text.replace("Your answer: ", ""))).toEqual({
      action: "accept", content: { name: "keyboard-project", tests: false, template: "web", workers: 1 },
    });
    expect(setup.captureCharFrame()).toContain("Keep my draft");
    expect(controller.snapshot().interaction).toBeUndefined();
    await setup.mockInput.typeText("!");
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Keep my draft!");
  } finally { controller.dispose(); await setup.dispose(); storage.close(); }
}, 15_000);

test("queued forms reset values and errors while keeping the composer isolated", async () => {
  const storage = new Storage(":memory:");
  const definition = demoAgent();
  definition.args = [resolve(import.meta.dir, "fixtures/agent.ts")];
  const controller = new Controller({ defaultAgent: "demo", agents: { demo: definition } }, storage, resolve(import.meta.dir, ".."), "demo");
  const setup = await testRender(() => <App controller={controller} quit={() => {}} autoConnect={false} />, { width: 60, height: 24, kittyKeyboard: true });
  try {
    await controller.open();
    await setup.renderOnce();
    await setup.mockInput.typeText("Unchanged draft");
    const turn = controller.send("questions");
    await waitForWorkerFrame(setup, frame => frame.includes("First question"));
    setup.mockInput.pressEnter();
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("must NOT have fewer");
    await setup.mockInput.typeText("first-answer");
    setup.mockInput.pressKey("e", { ctrl: true });
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Ctrl+E questions");
    setup.mockInput.pressEnter({ ctrl: true });
    await waitForWorkerFrame(setup, frame => frame.includes("Second question"));
    expect(setup.captureCharFrame()).toContain("Name *");
    expect(setup.captureCharFrame()).toContain("0 answered");
    expect(setup.captureCharFrame()).toContain("Ctrl+E JSON");
    setup.mockInput.pressKey("\x1b[13;1:2u");
    await setup.renderOnce();
    expect(setup.captureCharFrame()).not.toContain("must NOT have fewer");
    expect(setup.captureCharFrame()).not.toContain("first-answer");
    setup.mockInput.pressKey("d", { ctrl: true });
    await turn;
    await setup.renderOnce();
    const last = controller.session.items.at(-1);
    expect(last?.type === "message" && JSON.parse(last.text)).toEqual([{ action: "accept", content: { name: "first-answer" } }, { action: "decline" }]);
    expect(setup.captureCharFrame()).toContain("Unchanged draft");
  } finally { controller.dispose(); await setup.dispose(); storage.close(); }
}, 15_000);
