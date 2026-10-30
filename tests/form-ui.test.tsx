import { expect, test } from "bun:test";
import { testRender } from "@opentui/solid";
import type { ElicitationSchema } from "@agentclientprotocol/sdk";
import { InteractionView } from "../src/ui/interaction";
import { themes } from "../src/ui/theme";
import type { FormContent } from "../src/ui/form-state";

async function renderForm(schema: ElicitationSchema, width = 100, height = 35) {
  const answers: { id?: string; content?: FormContent }[] = [];
  const setup = await testRender(() => <box width="100%" height="100%">
    <InteractionView interaction={{ id: "form", title: "Build a project", options: [], form: schema }} theme={themes.dark}
      answer={(id, content) => answers.push({ id, content })} />
  </box>, { width, height, kittyKeyboard: true });
  await setup.renderOnce();
  const key = async (name: string, modifiers: { ctrl?: boolean; shift?: boolean; meta?: boolean } = {}) => {
    const keys: Record<string, string> = { return: "RETURN", escape: "ESCAPE", down: "ARROW_DOWN", up: "ARROW_UP", left: "ARROW_LEFT", right: "ARROW_RIGHT" };
    setup.mockInput.pressKey(keys[name] ?? name, modifiers);
    await setup.renderOnce();
  };
  return { ...setup, answers, key };
}

test("one question at a time confirms typed answers and automatically submits after the final skip", async () => {
  const setup = await renderForm({ properties: {
    name: { type: "string", title: "Project name", minLength: 1 },
    tests: { type: "boolean", title: "Include tests", default: true },
    mode: { type: "string", title: "Template", oneOf: [{ const: "cli", title: "Command line" }, { const: "web", title: "Web app" }] },
    count: { type: "integer", title: "Workers", minimum: 1, maximum: 8 },
    note: { type: "string", title: "Notes" },
  }, required: ["name"] });
  try {
    expect(setup.captureCharFrame()).toContain("Question 1/5");
    expect(setup.captureCharFrame()).toContain("Project name *");
    expect(setup.captureCharFrame()).not.toContain("Include tests");
    await setup.mockInput.typeText("example");
    await setup.key("return");
    expect(setup.captureCharFrame()).toContain("Include tests");
    expect(setup.captureCharFrame()).not.toContain("Project name");
    expect(setup.captureCharFrame()).toContain("> Yes");
    await setup.key("down");
    expect(setup.captureCharFrame()).toContain("> No");
    expect(setup.answers).toEqual([]);
    await setup.key("return");
    expect(setup.captureCharFrame()).toContain("> Command line");
    expect(setup.captureCharFrame()).toContain("Web app");
    await setup.key("down");
    await setup.key("return");
    await setup.mockInput.typeText("3");
    await setup.key("return");
    expect(setup.captureCharFrame()).toContain("4 answered");
    expect(setup.answers).toEqual([]);
    await setup.key("u", { ctrl: true });
    expect(setup.answers).toEqual([{ id: "accept", content: { name: "example", tests: false, mode: "web", count: 3 } }]);
    await setup.key("return");
    expect(setup.answers).toHaveLength(1);
  } finally { await setup.dispose(); }
});

test("defaults and Left/Right navigation never count as answers; confirmation returns to unanswered questions", async () => {
  const setup = await renderForm({ properties: {
    first: { type: "boolean", default: false }, second: { type: "boolean", default: true },
  }, required: ["first", "second"] });
  try {
    expect(setup.captureCharFrame()).toContain("> No");
    await setup.key("left");
    expect(setup.captureCharFrame()).toContain("Question 1/2");
    await setup.key("right");
    await setup.key("right");
    expect(setup.captureCharFrame()).toContain("Question 2/2");
    expect(setup.captureCharFrame()).toContain("0 answered");
    await setup.key("return");
    expect(setup.captureCharFrame()).toContain("Question 1/2");
    expect(setup.answers).toEqual([]);
    await setup.key("up");
    await setup.key("down");
    await setup.key("return");
    expect(setup.answers).toEqual([{ id: "accept", content: { first: false, second: true } }]);
  } finally { await setup.dispose(); }
});

test("revisiting preserves drafts, confirmed choices and uncommitted highlights", async () => {
  const setup = await renderForm({ properties: {
    choice: { type: "boolean" }, text: { type: "string" },
  }, required: ["choice", "text"] });
  try {
    await setup.key("return");
    await setup.mockInput.typeText("draft");
    await setup.key("left");
    expect(setup.captureCharFrame()).toContain("> Yes (selected)");
    await setup.key("down");
    expect(setup.captureCharFrame()).toContain("> No");
    expect(setup.captureCharFrame()).toContain("Yes (selected)");
    await setup.key("right");
    expect(setup.captureCharFrame()).toContain("draft");
    await setup.key("left");
    expect(setup.captureCharFrame()).toContain("> No");
    await setup.key("return");
    await setup.key("return");
    expect(setup.answers).toEqual([{ id: "accept", content: { choice: false, text: "draft" } }]);
  } finally { await setup.dispose(); }
});

test("editing a confirmed text answer requires reconfirmation and supports cursor movement and newlines", async () => {
  const setup = await renderForm({ properties: { text: { type: "string" }, other: { type: "boolean" } }, required: ["text", "other"] });
  try {
    await setup.mockInput.typeText("ab");
    await setup.key("return");
    await setup.key("left");
    await setup.key("END");
    await setup.key("b", { ctrl: true });
    await setup.mockInput.typeText("X");
    await setup.key("END");
    await setup.key("return", { shift: true });
    await setup.mockInput.typeText("line");
    expect(setup.captureCharFrame()).toContain("aXb");
    expect(setup.captureCharFrame()).toContain("0 answered");
    await setup.key("right");
    await setup.key("return");
    expect(setup.answers).toEqual([]);
    expect(setup.captureCharFrame()).toContain("Question 1/2");
    await setup.key("return");
    expect(setup.answers).toEqual([{ id: "accept", content: { text: "aXb\nline", other: true } }]);
  } finally { await setup.dispose(); }
});

test("invalid answers block progress without validating unanswered required questions", async () => {
  const setup = await renderForm({ properties: {
    name: { type: "string", minLength: 2 }, count: { type: "integer", minimum: 1, maximum: 3 },
  }, required: ["name", "count"] });
  try {
    await setup.key("return");
    expect(setup.captureCharFrame()).toContain("must NOT have fewer than 2");
    await setup.mockInput.typeText("ok");
    await setup.key("return");
    expect(setup.captureCharFrame()).toContain("Question 2/2");
    await setup.mockInput.typeText("abc");
    await setup.key("return");
    expect(setup.captureCharFrame()).toContain("Enter a finite number.");
    await setup.key("u", { ctrl: true });
    await setup.mockInput.typeText("4");
    await setup.key("return");
    expect(setup.captureCharFrame()).toContain("must be <= 3");
    expect(setup.answers).toEqual([]);
    await setup.key("u", { ctrl: true });
    await setup.mockInput.typeText("3");
    await setup.key("return");
    expect(setup.answers).toEqual([{ id: "accept", content: { name: "ok", count: 3 } }]);
  } finally { await setup.dispose(); }
});

test("Skip options omit optional values while empty strings, zero and false remain answers", async () => {
  const setup = await renderForm({ properties: {
    text: { type: "string" }, count: { type: "integer", default: 0 },
    enabled: { type: "boolean", default: false }, skipped: { type: "boolean", default: true },
  } });
  try {
    await setup.key("return");
    await setup.key("return");
    await setup.key("return");
    await setup.key("down");
    await setup.key("down");
    expect(setup.captureCharFrame()).toContain("> Skip (leave unset)");
    await setup.key("return");
    expect(setup.answers).toEqual([{ id: "accept", content: { text: "", count: 0, enabled: false } }]);
  } finally { await setup.dispose(); }
});

test("advancing preserves normalized numeric answers and skips previously entered text", async () => {
  const setup = await renderForm({ properties: {
    count: { type: "number" }, notes: { type: "string" }, last: { type: "boolean" },
  } });
  try {
    await setup.mockInput.typeText(" 1e2 ");
    await setup.key("return");
    expect(setup.captureCharFrame()).toContain("1 answered");
    await setup.mockInput.typeText("discard this optional draft");
    await setup.key("u", { ctrl: true });
    expect(setup.captureCharFrame()).toContain("2 answered");
    await setup.key("return");
    expect(setup.answers).toEqual([{ id: "accept", content: { count: 100, last: true } }]);
  } finally { await setup.dispose(); }
});

test("JSON round trips preserve confirmation but never auto-submit on switching modes", async () => {
  const setup = await renderForm({ properties: { text: { type: "string", default: "hello\nworld" }, enabled: { type: "boolean", default: false } } });
  try {
    await setup.key("return");
    await setup.key("e", { ctrl: true });
    expect(setup.captureCharFrame()).toContain("Ctrl+E questions");
    await setup.key("e", { ctrl: true });
    expect(setup.captureCharFrame()).toContain("1 answered");
    expect(setup.answers).toEqual([]);
    await setup.key("e", { ctrl: true });
    await setup.mockInput.typeText("!");
    await setup.key("e", { ctrl: true });
    expect(setup.captureCharFrame()).toContain("JSON Parse error");
    setup.mockInput.pressBackspace();
    await setup.key("e", { ctrl: true });
    await setup.key("return");
    expect(setup.answers).toEqual([{ id: "accept", content: { text: "hello\nworld", enabled: false } }]);
  } finally { await setup.dispose(); }
});

test("changed JSON values reset only the affected confirmations", async () => {
  const setup = await renderForm({ properties: { first: { type: "boolean" }, second: { type: "boolean", default: true } } });
  try {
    await setup.key("return");
    await setup.key("e", { ctrl: true });
    await setup.key("HOME");
    await setup.key("END", { shift: true });
    await setup.mockInput.typeText('{"first":false,"second":true}');
    await setup.key("e", { ctrl: true });
    expect(setup.captureCharFrame()).toContain("0 answered");
    await setup.key("return");
    expect(setup.captureCharFrame()).toContain("Question 1/2");
    expect(setup.captureCharFrame()).toContain("> No");
    expect(setup.answers).toEqual([]);
    await setup.key("return");
    expect(setup.answers).toEqual([{ id: "accept", content: { first: false, second: true } }]);
  } finally { await setup.dispose(); }
});

test("array schemas keep explicit JSON submission and block unsupported question mode", async () => {
  const setup = await renderForm({ properties: { tags: { type: "array", items: { type: "string", enum: ["one", "two"] }, default: ["one"] } } });
  try {
    expect(setup.captureCharFrame()).toContain("JSON required for: tags");
    await setup.key("e", { ctrl: true });
    expect(setup.captureCharFrame()).toContain("JSON is required for: tags");
    await setup.key("return", { ctrl: true });
    expect(setup.answers).toEqual([{ id: "accept", content: { tags: ["one"] } }]);
  } finally { await setup.dispose(); }
});

test("invalid numeric drafts cannot be lost by switching to JSON", async () => {
  const setup = await renderForm({ properties: { count: { type: "integer" } } });
  try {
    await setup.mockInput.typeText("4x");
    await setup.key("e", { ctrl: true });
    expect(setup.captureCharFrame()).toContain("Enter a finite number before switching");
    expect(setup.captureCharFrame()).toContain("4x");
    expect(setup.answers).toEqual([]);
  } finally { await setup.dispose(); }
});

test("long choice lists scroll the highlight in a narrow terminal", async () => {
  const setup = await renderForm({ properties: { choice: { type: "string", enum: Array.from({ length: 20 }, (_, i) => `Option ${i}`) } } }, 60, 24);
  try {
    for (let i = 0; i < 19; i++) await setup.key("down");
    expect(setup.captureCharFrame()).toContain("> Option 19");
    expect(setup.captureCharFrame()).toContain("Enter select");
    expect(setup.captureCharFrame()).toContain("Esc cancel");
    await setup.key("return");
    expect(setup.answers).toEqual([{ id: "accept", content: { choice: "Option 19" } }]);
  } finally { await setup.dispose(); }
});

test("long-list default highlights and revisited choices remain visible", async () => {
  const setup = await renderForm({ properties: {
    choice: { type: "string", enum: Array.from({ length: 20 }, (_, i) => `Option ${i}`), default: "Option 19" },
    next: { type: "string" },
  } }, 60, 24);
  try {
    expect(setup.captureCharFrame()).toContain("> Option 19");
    await setup.key("right");
    expect(setup.captureCharFrame()).not.toContain("Option 19");
    await setup.key("left");
    expect(setup.captureCharFrame()).toContain("> Option 19");
    await setup.key("up");
    await setup.key("right");
    await setup.key("left");
    expect(setup.captureCharFrame()).toContain("> Option 18");
    expect(setup.answers).toEqual([]);
  } finally { await setup.dispose(); }
});

test("empty schemas require an explicit Enter and submit once", async () => {
  const setup = await renderForm({});
  try {
    expect(setup.answers).toEqual([]);
    expect(setup.captureCharFrame()).toContain("No questions.");
    await setup.key("return");
    await setup.key("return");
    expect(setup.answers).toEqual([{ id: "accept", content: {} }]);
  } finally { await setup.dispose(); }
});

test("key repeats do not confirm another question", async () => {
  const setup = await renderForm({ properties: { first: { type: "boolean" }, second: { type: "boolean" } } });
  try {
    await setup.key("return");
    await setup.key("\x1b[13;1:2u");
    expect(setup.captureCharFrame()).toContain("1 answered");
    expect(setup.answers).toEqual([]);
    await setup.key("return");
    expect(setup.answers).toEqual([{ id: "accept", content: { first: true, second: true } }]);
  } finally { await setup.dispose(); }
});

test("decline and cancel remain distinct", async () => {
  for (const action of ["decline", "cancel"]) {
    const setup = await renderForm({ properties: { name: { type: "string" } } });
    try {
      await setup.key(action === "decline" ? "d" : "escape", { ctrl: action === "decline" });
      expect(setup.answers).toEqual([{ id: action === "decline" ? "decline" : undefined, content: undefined }]);
    } finally { await setup.dispose(); }
  }
});

test("permission and URL options still return the agent's exact IDs", async () => {
  for (const url of [undefined, "https://example.com/confirm"]) {
    const answers: (string | undefined)[] = [];
    const setup = await testRender(() => <InteractionView interaction={{
      id: "interaction", title: url ? "Open this URL" : "Permission",
      url, options: [{ id: "agent:once", name: "Allow once" }, { id: "agent:never", name: "Deny" }],
    }} theme={themes.dark} answer={id => answers.push(id)} />, { width: 80, height: 24 });
    try {
      await setup.renderOnce();
      if (url) expect(setup.captureCharFrame()).toContain(url);
      setup.mockInput.pressArrow("down");
      setup.mockInput.pressEnter();
      expect(answers).toEqual(["agent:never"]);
    } finally { await setup.dispose(); }
  }
});
