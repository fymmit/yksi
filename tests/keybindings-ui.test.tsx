import { expect, test } from "bun:test";
import { testRender } from "@opentui/solid";
import { App } from "../src/ui/app";
import { Picker } from "../src/ui/picker";
import { InteractionView } from "../src/ui/interaction";
import { themes } from "../src/ui/theme";
import { Controller } from "../src/controller";
import { Storage } from "../src/storage";
import { configSchema } from "../src/config";
import { resolveKeybindings, type KeyOverrides } from "../src/keybindings";
import type { FormContent } from "../src/ui/form-state";

async function renderApp(keybindings: KeyOverrides) {
  const storage = new Storage(":memory:");
  const controller = new Controller(configSchema.parse({ keybindings }), storage, "/project", "copilot");
  const prompts: string[] = [];
  let quits = 0;
  let cancellations = 0;
  controller.status = "ready";
  controller.send = async text => { prompts.push(text); };
  controller.cancel = async () => { cancellations++; };
  const setup = await testRender(() => <App controller={controller} quit={() => { quits++; }} autoConnect={false} />, { width: 100, height: 35, kittyKeyboard: true });
  await setup.renderOnce();
  return { ...setup, controller, storage, prompts, quits: () => quits, cancellations: () => cancellations,
    async cleanup() { controller.dispose(); await setup.dispose(); storage.close(); } };
}

function installModes(controller: Controller) {
  const changes: string[] = [];
  controller.session.modes = { currentModeId: "ask", availableModes: [{ id: "ask", name: "Ask" }, { id: "plan", name: "Plan" }] };
  controller.setMode = async mode => {
    changes.push(mode);
    controller.session.modes!.currentModeId = mode;
    controller.emit("change", controller.snapshot());
  };
  controller.emit("change", controller.snapshot());
  return changes;
}

test("Shift+Tab cycles modes without changing drafts, ignores repeat/release events, and shows narrow-terminal feedback", async () => {
  const setup = await renderApp({});
  const changes = installModes(setup.controller);
  try {
    setup.resize(60, 20);
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Mode: Ask · Shift+Tab cycle mode");
    await setup.mockInput.typeText("keep draft");
    setup.mockInput.pressKey("TAB");
    setup.mockInput.pressKey("TAB", { ctrl: true, shift: true });
    expect(changes).toEqual([]);
    setup.mockInput.pressKey("\x1b[Z"); // Traditional terminal backtab.
    await setup.renderOnce();
    expect(changes).toEqual(["plan"]);
    expect(setup.captureCharFrame()).toContain("Mode: Plan · Shift+Tab cycle mode");
    expect(setup.captureCharFrame()).toContain("keep draft");
    expect(setup.captureCharFrame()).not.toContain("Agent session settings");
    setup.mockInput.pressKey("\x1b[9;2:2u");
    setup.mockInput.pressKey("\x1b[9;2:3u");
    await setup.renderOnce();
    expect(changes).toEqual(["plan"]);
    setup.mockInput.pressKey("TAB", { shift: true });
    await setup.renderOnce();
    expect(changes).toEqual(["plan", "ask"]);
    setup.mockInput.pressEnter();
    expect(setup.prompts).toEqual(["keep draft"]);
  } finally { await setup.cleanup(); }
});

test("cycle-mode remaps and disabling retain palette access and shortcut labels", async () => {
  for (const bindings of [["alt+m", "f2"], []]) {
    const setup = await renderApp({ "app.cycle-mode": bindings });
    const changes = installModes(setup.controller);
    try {
      await setup.renderOnce();
      expect(setup.captureCharFrame()).toContain(bindings.length ? "Alt+M cycle mode" : "cycle mode (unbound)");
      setup.mockInput.pressKey("TAB", { shift: true });
      expect(changes).toEqual([]);
      if (bindings.length) {
        setup.mockInput.pressKey("m", { meta: true });
        await setup.renderOnce();
        expect(changes).toEqual(["plan"]);
      }
      setup.mockInput.pressKey("p", { ctrl: true });
      await setup.mockInput.typeText("Cycle mode");
      await setup.renderOnce();
      expect(setup.captureCharFrame()).toContain("Cycle mode");
      if (bindings.length) expect(setup.captureCharFrame()).toContain("Alt+M / F2");
      setup.mockInput.pressEnter();
      await setup.renderOnce();
      expect(changes.length).toBe(bindings.length ? 2 : 1);
    } finally { await setup.cleanup(); }
  }
});

test("mode cycling is scoped to the composer and is available as a client command", async () => {
  const setup = await renderApp({});
  const changes = installModes(setup.controller);
  try {
    setup.mockInput.pressKey("p", { ctrl: true });
    setup.mockInput.pressKey("TAB", { shift: true });
    expect(changes).toEqual([]);
    setup.mockInput.pressKey("ESCAPE");
    for (const form of [undefined, { properties: { enabled: { type: "boolean" as const } } }]) {
      setup.controller.emit("change", { ...setup.controller.snapshot(), interaction: { id: "question", title: "Confirm?", options: [{ id: "yes", name: "Yes" }], form } });
      await setup.renderOnce();
      setup.mockInput.pressKey("TAB", { shift: true });
      expect(changes).toEqual([]);
    }
    setup.controller.emit("change", setup.controller.snapshot());
    await setup.renderOnce();
    await setup.mockInput.typeText("/tui:cycle-mode");
    setup.mockInput.pressEnter();
    await setup.renderOnce();
    expect(changes).toEqual(["plan"]);
    expect(setup.prompts).toEqual([]);
    expect(setup.captureCharFrame()).toContain("Mode: Plan");
  } finally { await setup.cleanup(); }
});

test("config mode feedback follows replacement snapshots and settings omit duplicate legacy modes", async () => {
  const setup = await renderApp({});
  try {
    setup.controller.session.modes = { currentModeId: "legacy", availableModes: [{ id: "legacy", name: "Legacy mode" }] };
    setup.controller.session.configOptions = [{ id: "operation", name: "Mode", category: "mode", type: "select", currentValue: "plan", options: [
      { group: "all", name: "All", options: [{ value: "plan", name: "Plan" }, { value: "code", name: "Code" }] },
    ] }];
    setup.controller.emit("change", setup.controller.snapshot());
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Mode: Plan · Shift+Tab cycle mode");
    expect(setup.captureCharFrame()).not.toContain("Mode: legacy");
    setup.mockInput.pressKey("m", { ctrl: true });
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Agent session settings");
    expect(setup.captureCharFrame()).not.toContain("Legacy mode");
    setup.mockInput.pressKey("ESCAPE");
    setup.controller.session.configOptions = [{ id: "operation", name: "Mode", category: "mode", type: "boolean", currentValue: true }];
    setup.controller.emit("change", setup.controller.snapshot());
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Mode: On · Shift+Tab cycle mode");
  } finally { await setup.cleanup(); }
});

test("remapped app commands update hints, consume only exact keys and keep palette actions available", async () => {
  const setup = await renderApp({ "app.commands": ["alt+p"], "app.sidebar": [], "app.theme": ["alt+t"] });
  try {
    expect(setup.captureCharFrame()).toContain("Alt+P commands");
    expect(setup.captureCharFrame()).not.toContain("Ctrl+P");
    await setup.mockInput.typeText("draft");
    setup.mockInput.pressKey("p", { ctrl: true });
    setup.mockInput.pressKey("p", { meta: true, shift: true });
    setup.mockInput.pressKey("b", { ctrl: true });
    await setup.renderOnce();
    expect(setup.captureCharFrame()).not.toContain("Command palette");
    expect(setup.storage.setting("sidebar", true)).toBe(true);
    setup.mockInput.pressKey("t", { meta: true });
    await setup.renderOnce();
    expect(setup.storage.setting("theme", "dark")).toBe("light");
    setup.mockInput.pressKey("p", { meta: true });
    await setup.mockInput.typeText("Toggle sidebar");
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Toggle sidebar");
    setup.mockInput.pressEnter();
    await setup.renderOnce();
    expect(setup.storage.setting("sidebar", true)).toBe(false);
    expect(setup.captureCharFrame()).toContain("draft");
  } finally { await setup.cleanup(); }
});

test("composer remaps submit and newline without inheriting removed editor bindings", async () => {
  const setup = await renderApp({ "composer.submit": ["ctrl+enter"], "composer.newline": ["enter"] });
  try {
    await setup.mockInput.typeText("hello");
    setup.mockInput.pressEnter();
    await setup.mockInput.typeText("world");
    setup.mockInput.pressEnter({ meta: true });
    setup.mockInput.pressEnter({ shift: true });
    await setup.mockInput.typeText("!");
    expect(setup.prompts).toEqual([]);
    setup.mockInput.pressEnter({ ctrl: true });
    await setup.renderOnce();
    expect(setup.prompts).toEqual(["hello\nworld!"]);
    expect(setup.captureCharFrame()).toContain("F1 Help");
    await setup.mockInput.pressKeys(["n", "e", "x", "t"], 0);
    setup.mockInput.pressEnter({ ctrl: true });
    expect(setup.prompts).toEqual(["hello\nworld!", "next"]);
  } finally { await setup.cleanup(); }
});

test("disabled submit and newline do not fall through to textarea defaults", async () => {
  const setup = await renderApp({ "composer.submit": [], "composer.newline": [] });
  try {
    await setup.mockInput.typeText("a");
    setup.mockInput.pressEnter();
    setup.mockInput.pressEnter({ meta: true });
    setup.mockInput.pressEnter({ shift: true });
    setup.mockInput.pressKey("j", { ctrl: true });
    await setup.mockInput.typeText("b");
    await setup.renderOnce();
    expect(setup.prompts).toEqual([]);
    expect(setup.captureCharFrame()).toContain("ab");
    expect(setup.captureCharFrame()).toContain("F1 Help");
  } finally { await setup.cleanup(); }
});

test("picker remaps navigation, selection and cancellation without leaking into its filter", async () => {
  const selected: string[] = [];
  let closed = 0;
  const keys = resolveKeybindings({ "picker.previous": ["alt+k"], "picker.next": ["alt+j"], "picker.confirm": ["alt+y"], "app.cancel": ["alt+c"] });
  const setup = await testRender(() => <Picker title="Pick" choices={["One", "Two"].map(id => ({ id, label: id, run: () => selected.push(id) }))}
    theme={themes.dark} keys={keys} height={30} close={() => { closed++; }} error={error => { throw error; }} />, { width: 80, height: 30, kittyKeyboard: true });
  try {
    await setup.renderOnce();
    setup.mockInput.pressArrow("down");
    setup.mockInput.pressEnter();
    setup.mockInput.pressKey("ESCAPE");
    expect(selected).toEqual([]);
    expect(closed).toBe(0);
    setup.mockInput.pressKey("j", { meta: true });
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("› Two");
    expect(setup.captureCharFrame()).toContain("Alt+Y confirm");
    setup.mockInput.pressKey("y", { meta: true });
    expect(selected).toEqual(["Two"]);
    setup.mockInput.pressKey("c", { meta: true });
    expect(closed).toBe(2);
  } finally { await setup.dispose(); }
});

test("form remaps text controls, confirmation and checkboxes while preserving answer semantics", async () => {
  const answers: { id?: string; content?: FormContent }[] = [];
  const keys = resolveKeybindings({ "form.confirm": ["alt+y"], "form.cursorLeft": ["alt+h"], "form.cursorRight": ["alt+l"], "form.newline": [], "form.toggle": ["alt+x"] });
  const setup = await testRender(() => <InteractionView theme={themes.dark} keys={keys} interaction={{ id: "form", title: "Questions", options: [], form: {
    properties: { name: { type: "string", title: "Name" }, extras: { type: "array", title: "Extras", items: { type: "string", enum: ["docs", "tests"] } } }, required: ["name", "extras"],
  } }} answer={(id, content) => answers.push({ id, content })} />, { width: 100, height: 35, kittyKeyboard: true });
  try {
    await setup.renderOnce();
    await setup.mockInput.typeText("ab");
    setup.mockInput.pressKey("b", { ctrl: true });
    setup.mockInput.pressEnter();
    setup.mockInput.pressEnter({ meta: true });
    await setup.mockInput.typeText("c");
    setup.mockInput.pressKey("h", { meta: true });
    await setup.mockInput.typeText("Z");
    setup.mockInput.pressKey("y", { meta: true });
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Extras");
    expect(setup.captureCharFrame()).toContain("Alt+X toggle");
    setup.mockInput.pressKey(" ");
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("[ ] docs");
    setup.mockInput.pressKey("x", { meta: true });
    setup.mockInput.pressKey("y", { meta: true });
    expect(answers).toEqual([{ id: "accept", content: { name: "abZc", extras: ["docs"] } }]);
  } finally { await setup.dispose(); }
});

test("JSON submission follows configured keys and ignores removed shortcuts", async () => {
  const answers: { id?: string; content?: FormContent }[] = [];
  const keys = resolveKeybindings({ "form.toggleJson": ["alt+e"], "form.submitJson": ["alt+y"], "form.decline": ["alt+d"], "app.cancel": ["alt+c"] });
  const setup = await testRender(() => <InteractionView theme={themes.dark} keys={keys} interaction={{ id: "json", title: "JSON form", options: [], form: {
    properties: { name: { type: "string", default: "value" } }, required: ["name"],
  } }} answer={(id, content) => answers.push({ id, content })} />, { width: 100, height: 35, kittyKeyboard: true });
  try {
    await setup.renderOnce();
    setup.mockInput.pressKey("e", { ctrl: true });
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Question 1/1");
    setup.mockInput.pressKey("e", { meta: true });
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Alt+Y submit");
    setup.mockInput.pressEnter({ ctrl: true });
    setup.mockInput.pressKey("ESCAPE");
    expect(answers).toEqual([]);
    setup.mockInput.pressKey("y", { meta: true });
    expect(answers).toEqual([{ id: "accept", content: { name: "value" } }]);
  } finally { await setup.dispose(); }
});

test("global interrupt keeps busy cancellation semantics and interaction keys stay isolated", async () => {
  const setup = await renderApp({ "app.interrupt": ["alt+i"], "app.quit": ["alt+q"], "app.cancel": ["alt+c"], "permission.confirm": ["alt+y"], "permission.next": ["alt+j"] });
  const answers: (string | undefined)[] = [];
  setup.controller.answer = id => { answers.push(id); };
  try {
    await setup.mockInput.typeText("draft");
    setup.controller.status = "working";
    setup.controller.emit("change", { ...setup.controller.snapshot(), interaction: { id: "permission", title: "Allow?", options: [{ id: "no", name: "No" }, { id: "yes", name: "Yes" }] } });
    await setup.renderOnce();
    setup.mockInput.pressEnter();
    setup.mockInput.pressKey("p", { ctrl: true });
    expect(answers).toEqual([]);
    setup.mockInput.pressKey("j", { meta: true });
    setup.mockInput.pressKey("y", { meta: true });
    expect(answers).toEqual(["yes"]);
    setup.mockInput.pressKey("c", { meta: true });
    expect(answers).toEqual(["yes", undefined]);
    setup.mockInput.pressKey("i", { meta: true });
    expect(setup.cancellations()).toBe(1);
    expect(setup.quits()).toBe(0);
    setup.controller.status = "ready";
    setup.controller.emit("change", setup.controller.snapshot());
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("draft");
    setup.mockInput.pressKey("i", { meta: true });
    setup.mockInput.pressKey("q", { meta: true });
    expect(setup.quits()).toBe(2);
  } finally { await setup.cleanup(); }
});

test("a shared app/form shortcut uses the active context and remapped decline preserves the draft", async () => {
  const setup = await renderApp({ "app.commands": ["alt+p"], "form.toggleJson": ["alt+p"], "form.decline": ["alt+d"], "app.cancel": ["alt+c"] });
  const answers: (string | undefined)[] = [];
  setup.controller.answer = id => { answers.push(id); };
  try {
    await setup.mockInput.typeText("keep draft");
    setup.controller.emit("change", { ...setup.controller.snapshot(), interaction: { id: "form", title: "Questions", options: [], form: {
      properties: { enabled: { type: "boolean", default: false } }, required: ["enabled"],
    } } });
    await setup.renderOnce();
    setup.mockInput.pressKey("d", { ctrl: true });
    setup.mockInput.pressKey("ESCAPE");
    expect(answers).toEqual([]);
    setup.mockInput.pressKey("p", { meta: true });
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Alt+P questions");
    expect(setup.captureCharFrame()).not.toContain("Command palette");
    setup.mockInput.pressKey("d", { meta: true });
    expect(answers).toEqual(["decline"]);
    setup.controller.emit("change", setup.controller.snapshot());
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("keep draft");
    setup.mockInput.pressKey("p", { meta: true });
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Command palette");
  } finally { await setup.cleanup(); }
});
