import { expect, test } from "bun:test";
import { testRender } from "@opentui/solid";
import { CodeRenderable, TextareaRenderable, type Renderable, rgbToHex } from "@opentui/core";
import { App } from "../src/ui/app";
import { Controller } from "../src/controller";
import { Storage } from "../src/storage";
import { configSchema } from "../src/config";
import { applyUpdate } from "../src/state";
import { themePresets } from "../src/themes";

type Setup = Awaited<ReturnType<typeof testRender>>;
function spans(setup: Setup) {
  return setup.captureSpans().lines.flatMap(line => line.spans);
}
function hasColor(setup: Setup, text: string, color: string, channel: "fg" | "bg" = "fg") {
  return spans(setup).some(
    span =>
      span.text.includes(text) && rgbToHex(span[channel]).toLowerCase() === color.toLowerCase(),
  );
}
async function waitFor(setup: Setup, predicate: () => boolean) {
  const deadline = Date.now() + 3000;
  do {
    await setup.renderOnce();
    if (predicate()) return;
    await Bun.sleep(10);
  } while (Date.now() < deadline);
  throw new Error(`Expected themed frame:\n${setup.captureCharFrame()}`);
}
function descendants(node: Renderable): Renderable[] {
  return [node, ...node.getChildren().flatMap(descendants)];
}

test("theme picker applies custom UI, syntax, Markdown and diff colors to existing content", async () => {
  const storage = new Storage(":memory:");
  const config = configSchema.parse({
    keybindings: { "app.theme": ["alt+t"] },
    themes: {
      custom: {
        extends: "catppuccin-mocha",
        colors: {
          background: "#101112",
          accent: "#aabbcc",
          inputText: "#abcdef",
          inputFocusedText: "#abcdef",
          inputBackground: "#202122",
          inputFocusedBackground: "#202122",
          placeholder: "#bbccdd",
          cursor: "#ccddee",
          selectionBackground: "#304050",
          selectionText: "#ddeeff",
          diffAddedContentBackground: "#123420",
          diffRemovedContentBackground: "#341220",
          diffAddedSign: "#12ab34",
          diffRemovedSign: "#ab1234",
          diffLineNumber: "#6789ab",
          selectedText: "#123abc",
          selectedBackground: "#456789",
        },
        syntax: { keyword: "#ab12cd", number: "#cd12ab" },
        markdown: {
          heading: "#12abcd",
          codeBackground: "#212324",
          tableBorder: "#de1234",
          quote: "#deabcd",
        },
      },
    },
  });
  const controller = new Controller(config, storage, "/project", "copilot");
  applyUpdate(controller.session, {
    sessionUpdate: "agent_message_chunk",
    content: {
      type: "text",
      text: "# Theme heading\n\n```typescript\nconst answer = 42;\n```\n\n| Column |\n| --- |\n| Cell |\n\n> Quoted text\n",
    },
  });
  applyUpdate(controller.session, {
    sessionUpdate: "tool_call",
    toolCallId: "edit",
    title: "Edit file",
    status: "completed",
    content: [{ type: "diff", path: "/project/a.txt", oldText: "before\n", newText: "after\n" }],
  });
  const setup = await testRender(
    () => <App controller={controller} quit={() => {}} autoConnect={false} />,
    { width: 110, height: 50, kittyKeyboard: true },
  );
  try {
    setup.mockInput.pressKey("o", { ctrl: true });
    await waitFor(setup, () => setup.captureCharFrame().includes("Theme heading"));
    await setup.mockInput.typeText("keep this draft");
    const editor = descendants(setup.renderer.root).find(
      node => node instanceof TextareaRenderable,
    ) as TextareaRenderable;
    setup.mockInput.pressKey("t", { meta: true });
    await setup.mockInput.typeText("custom");
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Choose theme");
    setup.mockInput.pressEnter();
    await waitFor(
      setup,
      () => hasColor(setup, "Theme heading", "#12abcd") && hasColor(setup, "const", "#ab12cd"),
    );
    expect(storage.setting("theme", "dark")).toBe("custom");
    expect(hasColor(setup, "yksi", "#aabbcc")).toBe(true);
    expect(hasColor(setup, "keep this draft", "#abcdef")).toBe(true);
    expect(hasColor(setup, "keep this draft", "#202122", "bg")).toBe(true);
    expect(hasColor(setup, "42", "#cd12ab")).toBe(true);
    expect(hasColor(setup, "const", "#212324", "bg")).toBe(true);
    expect(hasColor(setup, "Quoted text", "#deabcd")).toBe(true);
    expect(hasColor(setup, "after", "#123420", "bg")).toBe(true);
    expect(hasColor(setup, "before", "#341220", "bg")).toBe(true);
    expect(hasColor(setup, "+", "#12ab34")).toBe(true);
    expect(hasColor(setup, "-", "#ab1234")).toBe(true);
    expect(spans(setup).some(span => rgbToHex(span.bg) === "#101112")).toBe(true);
    expect(spans(setup).some(span => rgbToHex(span.fg) === "#de1234")).toBe(true);
    expect(rgbToHex(editor.cursorColor)).toBe("#ccddee");
    expect(editor).toBe(
      descendants(setup.renderer.root).find(node => node instanceof TextareaRenderable)!,
    );
    const code = descendants(setup.renderer.root).find(
      node => node instanceof CodeRenderable && node.content.includes("const answer"),
    ) as CodeRenderable;
    expect(rgbToHex(code.selectionBg!)).toBe("#304050");
    expect(rgbToHex(code.selectionFg!)).toBe("#ddeeff");
    setup.mockInput.pressArrow("left", { shift: true });
    await setup.renderOnce();
    expect(hasColor(setup, "t", "#304050", "bg")).toBe(true);
    expect(hasColor(setup, "t", "#ddeeff")).toBe(true);
    setup.mockInput.pressKey("t", { meta: true });
    await setup.mockInput.typeText("custom");
    await setup.renderOnce();
    expect(hasColor(setup, "custom", "#123abc")).toBe(true);
    expect(hasColor(setup, "custom", "#456789", "bg")).toBe(true);
    setup.mockInput.pressKey("ESCAPE");
    await setup.renderOnce();
    expect(storage.setting("theme", "dark")).toBe("custom");
    // Tables use constructor-only selection colors in OpenTUI. Exercise a real
    // mouse selection rather than relying on a palette or style-object check.
    const rows = setup.captureCharFrame().split("\n");
    const row = rows.findIndex(line => line.includes("Cell"));
    const column = rows[row]!.indexOf("Cell");
    await setup.mockMouse.drag(column, row, column + 3, row);
    await setup.renderOnce();
    expect(hasColor(setup, "Cel", "#304050", "bg")).toBe(true);
    expect(hasColor(setup, "Cel", "#ddeeff")).toBe(true);
    setup.renderer.clearSelection();
    // New streaming blocks retain the current theme, including code backgrounds.
    applyUpdate(controller.session, {
      sessionUpdate: "agent_message_chunk",
      content: {
        type: "text",
        text: "\nMore streaming text.\n\n```typescript\nconst next = 7;\n```\n",
      },
    });
    controller.emit("change", controller.snapshot());
    await waitFor(setup, () => hasColor(setup, "7", "#cd12ab"));
    expect(hasColor(setup, "next", "#212324", "bg")).toBe(true);
  } finally {
    controller.dispose();
    await setup.dispose();
    storage.close();
  }
});

test("slash picker stays local, help preserves filtering, and persisted themes survive remounts", async () => {
  const storage = new Storage(":memory:");
  const config = configSchema.parse({});
  const controller = new Controller(config, storage, "/project", "copilot");
  let setup = await testRender(
    () => <App controller={controller} quit={() => {}} autoConnect={false} />,
    { width: 65, height: 28, kittyKeyboard: true },
  );
  try {
    await setup.mockInput.typeText("/tui:theme");
    setup.mockInput.pressEnter();
    await setup.mockInput.typeText("gruvbox");
    setup.mockInput.pressArrow("down");
    setup.mockInput.pressKey("F1");
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Current context · Pickers");
    setup.mockInput.pressKey("ESCAPE");
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("› Gruvbox Light");
    setup.mockInput.pressEnter();
    await setup.renderOnce();
    expect(controller.session.items).toHaveLength(0);
    expect(storage.setting("theme", "dark")).toBe("gruvbox-light");
    expect(hasColor(setup, "yksi", themePresets["gruvbox-light"].theme.accent)).toBe(true);
    await setup.dispose();
    setup = await testRender(
      () => <App controller={controller} quit={() => {}} autoConnect={false} />,
      { width: 65, height: 28, kittyKeyboard: true },
    );
    await setup.renderOnce();
    expect(hasColor(setup, "yksi", themePresets["gruvbox-light"].theme.accent)).toBe(true);
    await setup.dispose();
    controller.config.theme = "github-dark";
    setup = await testRender(
      () => <App controller={controller} quit={() => {}} autoConnect={false} />,
      { width: 65, height: 28, kittyKeyboard: true },
    );
    await setup.renderOnce();
    expect(hasColor(setup, "yksi", themePresets["github-dark"].theme.accent)).toBe(true);
    expect(storage.setting("theme", "dark")).toBe("gruvbox-light");
  } finally {
    controller.dispose();
    await setup.dispose();
    storage.close();
  }
});
