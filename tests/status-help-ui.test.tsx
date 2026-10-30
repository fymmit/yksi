import { expect, test } from "bun:test";
import { testRender } from "@opentui/solid";
import { App } from "../src/ui/app";
import { Controller } from "../src/controller";
import { Storage } from "../src/storage";
import { configSchema } from "../src/config";
import { applyUpdate } from "../src/state";
import { resolveKeybindings, type KeyOverrides } from "../src/keybindings";

async function renderApp(keybindings: KeyOverrides = {}, width = 110) {
  const storage = new Storage(":memory:");
  const controller = new Controller(
    configSchema.parse({ keybindings }),
    storage,
    "/project",
    "copilot",
  );
  controller.status = "ready";
  const prompts: string[] = [];
  const answers: unknown[] = [];
  let cancellations = 0;
  controller.send = async text => {
    prompts.push(text);
  };
  controller.answer = (id, content) => {
    answers.push({ id, content });
  };
  controller.cancel = async () => {
    cancellations++;
  };
  const setup = await testRender(
    () => <App controller={controller} quit={() => {}} autoConnect={false} />,
    { width, height: 35, kittyKeyboard: true },
  );
  await setup.renderOnce();
  return {
    ...setup,
    controller,
    storage,
    prompts,
    answers,
    cancellations: () => cancellations,
    footer: () => setup.captureCharFrame().trimEnd().split("\n").at(-1)!.trim(),
    async cleanup() {
      controller.dispose();
      await setup.dispose();
      storage.close();
    },
  };
}

test("compact status summarizes sidebar data, adapts to width and preserves the sidebar preference", async () => {
  const setup = await renderApp({}, 180);
  try {
    setup.controller.session.title = "Fix login";
    setup.controller.session.configOptions = [
      {
        id: "model",
        name: "Model",
        category: "model",
        type: "select",
        currentValue: "internal-model",
        options: [
          {
            group: "models",
            name: "Models",
            options: [{ value: "internal-model", name: "Friendly model" }],
          },
        ],
      },
      { id: "mode", name: "Mode", category: "mode", type: "boolean", currentValue: true },
    ];
    applyUpdate(setup.controller.session, {
      sessionUpdate: "usage_update",
      used: 24000,
      size: 128000,
      cost: { currency: "USD", amount: 0 },
    });
    applyUpdate(setup.controller.session, {
      sessionUpdate: "plan",
      entries: [
        { content: "Inspect login", priority: "medium", status: "completed" },
        { content: "Implement fix", priority: "medium", status: "in_progress" },
      ],
    });
    applyUpdate(setup.controller.session, {
      sessionUpdate: "tool_call",
      toolCallId: "edit",
      title: "Edit login",
      status: "completed",
      content: [{ type: "diff", path: "/project/login.ts", oldText: "old", newText: "new" }],
    });
    setup.controller.emit("change", setup.controller.snapshot());
    await setup.renderOnce();
    for (const text of [
      "Model: Friendly model",
      "Mode: On",
      "Context: 24k/128k",
      "Cost: USD 0.00",
      "Plan: 1/2",
      "Files: 1",
      "F1 Help",
    ])
      expect(setup.footer()).toContain(text);
    expect(setup.footer()).not.toContain("Fix login");
    expect(setup.footer()).not.toContain("copilot");
    expect(setup.captureCharFrame()).toContain("Reported diffs");
    expect(setup.captureCharFrame()).not.toContain("Ctrl+B hide sidebar");
    setup.resize(99, 24);
    await setup.renderOnce();
    expect(setup.footer().split("F1 Help")[0]!.trim()).toBe(
      "Mode: On · …endly model · 24k/128k · USD 0.00 · 1/2 · 1 file",
    );
    setup.resize(60, 24);
    await setup.renderOnce();
    expect(setup.footer()).toContain("24k/128k");
    expect(setup.footer()).toContain("USD 0.00");
    expect(setup.footer()).toContain("Mode: On");
    expect(setup.footer()).not.toContain("Model:");
    expect(setup.footer()).not.toContain("Context:");
    expect(setup.footer()).toEndWith("F1 Help");
    expect(setup.captureCharFrame()).not.toContain("Reported diffs");
    for (const [cost, text] of [
      [null, "Not reported"],
      [{ currency: "EUR", amount: 0.5 }, "EUR 0.50"],
    ] as const) {
      applyUpdate(setup.controller.session, {
        sessionUpdate: "usage_update",
        used: 25000,
        size: 128000,
        cost,
      });
      setup.controller.emit("change", setup.controller.snapshot());
      await setup.renderOnce();
      expect(setup.footer()).toContain("25k/128k");
      expect(setup.footer()).toContain(text);
      expect(setup.footer()).not.toContain("Cost:");
    }
    setup.resize(100, 35);
    await setup.renderOnce();
    expect(setup.footer()).toContain("Context: 25k/128k");
    expect(setup.footer()).toContain("Cost: EUR 0.50");
    expect(setup.footer()).toContain("Mode: On");
    expect(setup.captureCharFrame()).toContain("Reported diffs");
    setup.mockInput.pressKey("b", { ctrl: true });
    setup.resize(180, 35);
    await setup.renderOnce();
    expect(setup.captureCharFrame()).not.toContain("Reported diffs");
    expect(setup.storage.setting("sidebar", true)).toBe(false);
    setup.controller.session.title = "项目👩‍💻".repeat(40);
    setup.controller.emit("change", setup.controller.snapshot());
    for (const width of [80, 40, 20]) {
      setup.resize(width, 24);
      await setup.renderOnce();
      expect(setup.footer()).toEndWith("F1 Help");
      expect(Bun.stringWidth(setup.footer())).toBeLessThanOrEqual(width - 2);
    }
  } finally {
    await setup.cleanup();
  }
});

test("status field ordering is independent of agent option order and terminal width", async () => {
  const setup = await renderApp({}, 220);
  try {
    setup.controller.session.configOptions = [
      { id: "z", name: "Zeta", type: "boolean", currentValue: true },
      {
        id: "effort",
        name: "Effort",
        category: "thought_level",
        type: "select",
        currentValue: "high",
        options: [{ value: "high", name: "High" }],
      },
      {
        id: "model",
        name: "Model",
        category: "model",
        type: "select",
        currentValue: "m1",
        options: [{ value: "m1", name: "M1" }],
      },
      { id: "a", name: "Alpha", type: "boolean", currentValue: false },
      {
        id: "mode",
        name: "Mode",
        category: "mode",
        type: "select",
        currentValue: "build",
        options: [{ value: "build", name: "Build" }],
      },
    ];
    applyUpdate(setup.controller.session, {
      sessionUpdate: "usage_update",
      used: 1000,
      size: 2000,
      cost: { currency: "USD", amount: 0.5 },
    });
    applyUpdate(setup.controller.session, {
      sessionUpdate: "plan",
      entries: [{ content: "Implement", priority: "medium", status: "pending" }],
    });
    applyUpdate(setup.controller.session, {
      sessionUpdate: "tool_call",
      toolCallId: "edit",
      title: "Edit",
      content: [{ type: "diff", path: "/project/file.ts", oldText: "old", newText: "new" }],
    });
    for (let order = 0; order < 2; order++) {
      setup.controller.emit("change", setup.controller.snapshot());
      for (const [width, expected] of [
        [
          220,
          "Mode: Build · Model: M1 · Effort: High · Context: 1k/2k · Cost: USD 0.50 · Plan: 0/1 · Files: 1 · Alpha: Off · Zeta: On",
        ],
        [99, "Build · M1 · High · 1k/2k · USD 0.50 · 0/1 · 1 file · Alpha: Off · Zeta: On"],
        [40, "Build · M1 · 1k/2k · USD 0.50"],
      ] as const) {
        setup.resize(width, 35);
        await setup.renderOnce();
        expect(setup.footer().split("F1 Help")[0]!.trim()).toBe(expected);
      }
      setup.controller.session.configOptions.reverse();
    }
  } finally {
    await setup.cleanup();
  }
});

test.each(["config", "legacy"])("%s mode labels follow the layout breakpoint", async source => {
  const setup = await renderApp({}, 100);
  try {
    if (source === "config") {
      setup.controller.session.configOptions = [
        {
          id: "mode",
          name: "Session Mode",
          category: "mode",
          type: "select",
          currentValue: "build",
          options: [{ value: "build", name: "Build" }],
        },
        { id: "extra", name: "Extra", type: "boolean", currentValue: false },
      ];
    } else {
      setup.controller.session.modes = {
        currentModeId: "build",
        availableModes: [{ id: "build", name: "Build" }],
      };
    }
    setup.controller.emit("change", setup.controller.snapshot());
    for (const width of [100, 99, 100]) {
      setup.resize(width, 35);
      await setup.renderOnce();
      const summary = setup.footer().split("F1 Help")[0]!.trim();
      expect(summary).toBe(
        source === "config"
          ? width < 100
            ? "Build · Extra: Off"
            : "Session Mode: Build · Extra: Off"
          : width < 100
            ? "Build"
            : "Mode: Build",
      );
    }
  } finally {
    await setup.cleanup();
  }
});

test.each(["On", "Off", "Yes", "No", "True", "False", "Enabled", "Disabled"])(
  "toggle-like select value %s keeps its setting label in both layouts",
  async name => {
    const setup = await renderApp({}, 100);
    try {
      setup.controller.session.configOptions = [
        {
          id: "allow_all",
          name: "Allow All",
          category: "permissions",
          type: "select",
          currentValue: name.toLowerCase(),
          options: [
            { value: "on", name: "On" },
            { value: "off", name: "Off" },
            ...(!["On", "Off"].includes(name) ? [{ value: name.toLowerCase(), name }] : []),
          ],
        },
      ];
      setup.controller.emit("change", setup.controller.snapshot());
      for (const width of [100, 99, 30]) {
        setup.resize(width, 35);
        await setup.renderOnce();
        expect(setup.footer().split("F1 Help")[0]!.trim()).toBe(`Allow All: ${name}`);
      }
    } finally {
      await setup.cleanup();
    }
  },
);

test.each([
  {
    category: "model",
    name: "namespace/provider/👩‍💻e\u0301模型-v2",
    slim: "…/👩‍💻e\u0301模型-v2",
    wide: "…provider/👩‍💻e\u0301模型-v2",
  },
  {
    category: "mode",
    name: "Planning with confirmations",
    slim: "Planning wi…",
    wide: "Planning with confi…",
  },
  {
    category: undefined,
    name: "Detailed explanations",
    slim: "Detailed ex…",
    wide: "Detailed explanatio…",
  },
])("status truncates $category values in the appropriate direction", async entry => {
  const setup = await renderApp({}, 100);
  try {
    setup.controller.session.configOptions = [
      {
        id: "setting",
        name: "Setting",
        category: entry.category,
        type: "select",
        currentValue: "selected",
        options: [{ value: "selected", name: entry.name }],
      },
    ];
    setup.controller.emit("change", setup.controller.snapshot());
    for (const width of [100, 99, 100]) {
      setup.resize(width, 35);
      await setup.renderOnce();
      expect(setup.footer().split("F1 Help")[0]!.trim()).toBe(
        width < 100 ? entry.slim : `Setting: ${entry.wide}`,
      );
      expect(Bun.stringWidth(setup.footer())).toBeLessThanOrEqual(width - 2);
    }
  } finally {
    await setup.cleanup();
  }
});

test("floating help searches all shortcuts and closes without cancelling a turn or changing the draft", async () => {
  const setup = await renderApp();
  try {
    await setup.mockInput.typeText("keep draft");
    setup.controller.status = "working";
    setup.controller.emit("change", setup.controller.snapshot());
    setup.mockInput.pressKey("F1");
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Keyboard shortcuts");
    expect(setup.captureCharFrame()).toContain("Current context · Composer");
    expect(setup.footer()).toEndWith("F1 Help");
    setup.mockInput.pressKey("\x1b[57364;1:2u"); // Repeated Kitty F1.
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Keyboard shortcuts");
    await setup.mockInput.typeText("composer.newline");
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Insert newline");
    expect(setup.captureCharFrame()).toContain("Shift+Enter / Alt+Enter");
    setup.mockInput.pressEnter();
    expect(setup.prompts).toEqual([]);
    setup.mockInput.pressKey("ESCAPE");
    await setup.renderOnce();
    expect(setup.captureCharFrame()).not.toContain("Keyboard shortcuts");
    expect(setup.cancellations()).toBe(0);
    await setup.mockInput.typeText("!");
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("keep draft!");
    setup.controller.status = "ready";
    setup.controller.emit("change", setup.controller.snapshot());
    setup.mockInput.pressEnter();
    expect(setup.prompts).toEqual(["keep draft!"]);
  } finally {
    await setup.cleanup();
  }
});

test("help uses configured alternatives, unbound actions, remapped navigation and narrow layouts", async () => {
  const setup = await renderApp(
    {
      "app.help": ["alt+h", "f2"],
      "composer.submit": [],
      "composer.newline": ["enter"],
      "help.next": ["alt+j"],
      "app.cancel": ["alt+c"],
    },
    60,
  );
  try {
    expect(setup.footer()).toEndWith("Alt+H Help");
    setup.mockInput.pressKey("F1");
    await setup.renderOnce();
    expect(setup.captureCharFrame()).not.toContain("Keyboard shortcuts");
    setup.mockInput.pressKey("h", { meta: true });
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Alt+H / F2");
    expect(setup.captureCharFrame()).toContain("Alt+J down");
    for (let i = 0; i < 15; i++) setup.mockInput.pressKey("j", { meta: true });
    await setup.renderOnce();
    expect(setup.captureCharFrame()).not.toContain("Current context · Composer");
    await setup.mockInput.typeText("composer.submit");
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Send prompt");
    expect(setup.captureCharFrame()).toContain("Unbound");
    setup.mockInput.pressKey("ESCAPE");
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Keyboard shortcuts");
    setup.mockInput.pressKey("c", { meta: true });
    setup.mockInput.pressKey("F2");
    await setup.mockInput.typeText("alt+enter");
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Insert answer newline");
    expect(setup.captureCharFrame()).not.toContain("Insert newline");
    setup.mockInput.pressKey("F2");
    await setup.renderOnce();
    expect(setup.captureCharFrame()).not.toContain("Keyboard shortcuts");
  } finally {
    await setup.cleanup();
  }
});

test("unbound help remains available in the palette and as a local slash command", async () => {
  const setup = await renderApp({ "app.help": [] });
  try {
    expect(setup.footer()).toEndWith("Help (unbound)");
    setup.mockInput.pressKey("p", { ctrl: true });
    await setup.mockInput.typeText("Keyboard shortcuts");
    setup.mockInput.pressEnter();
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Current context · Composer");
    setup.mockInput.pressKey("ESCAPE");
    await setup.mockInput.typeText("/tui:help");
    setup.mockInput.pressEnter();
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Current context · Composer");
    expect(setup.prompts).toEqual([]);
  } finally {
    await setup.cleanup();
  }
});

test("help preserves picker filtering, selection and focus", async () => {
  const setup = await renderApp();
  try {
    await setup.mockInput.typeText("draft");
    setup.mockInput.pressKey("p", { ctrl: true });
    await setup.mockInput.typeText("Show");
    setup.mockInput.pressArrow("down"); // Reasoning after session usage.
    setup.mockInput.pressKey("F1");
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Current context · Pickers");
    await setup.mockInput.typeText("permission.confirm");
    setup.mockInput.pressEnter();
    setup.mockInput.pressArrow("down");
    setup.mockInput.pressKey("ESCAPE");
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Command palette");
    expect(setup.captureCharFrame()).toContain("› Show / hide reasoning");
    setup.mockInput.pressEnter();
    await setup.renderOnce();
    expect(setup.captureCharFrame()).not.toContain("Command palette");
    await setup.mockInput.typeText("!");
    setup.mockInput.pressEnter();
    expect(setup.prompts).toEqual(["draft!"]);
  } finally {
    await setup.cleanup();
  }
});

test("help suspends permissions and retains form text, choices and JSON drafts", async () => {
  const setup = await renderApp();
  try {
    setup.controller.emit("change", {
      ...setup.controller.snapshot(),
      interaction: {
        id: "permission",
        title: "Allow?",
        options: [
          { id: "no", name: "No" },
          { id: "yes", name: "Yes" },
        ],
      },
    });
    await setup.renderOnce();
    setup.mockInput.pressArrow("down");
    setup.mockInput.pressKey("F1");
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Current context · Permissions");
    setup.mockInput.pressArrow("up");
    setup.mockInput.pressEnter();
    setup.mockInput.pressKey("ESCAPE");
    expect(setup.answers).toEqual([]);
    setup.mockInput.pressEnter();
    expect(setup.answers).toEqual([{ id: "yes", content: undefined }]);

    setup.controller.emit("change", {
      ...setup.controller.snapshot(),
      interaction: {
        id: "form",
        title: "Questions",
        options: [],
        form: {
          properties: {
            name: { type: "string", title: "Name" },
            enabled: { type: "boolean", title: "Enabled" },
            note: { type: "string", default: "ready" },
          },
          required: ["name", "enabled", "note"],
        },
      },
    });
    await setup.renderOnce();
    await setup.mockInput.typeText("answer");
    setup.mockInput.pressKey("F1");
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Current context · Forms · Text");
    await setup.mockInput.typeText("form.confirm");
    setup.mockInput.pressEnter();
    setup.mockInput.pressKey("ESCAPE");
    await setup.mockInput.typeText("!");
    setup.mockInput.pressEnter();
    setup.mockInput.pressArrow("down");
    setup.mockInput.pressKey("F1");
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Current context · Forms · Choices");
    setup.mockInput.pressArrow("up");
    setup.mockInput.pressEnter();
    setup.mockInput.pressKey("ESCAPE");
    expect(setup.answers).toHaveLength(1);
    setup.mockInput.pressEnter(); // Confirm the preserved choice; the note is still unconfirmed.
    setup.mockInput.pressKey("e", { ctrl: true });
    await setup.renderOnce();
    setup.mockInput.pressKey("F1");
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Current context · Forms · JSON");
    await setup.mockInput.typeText("form.submitJson");
    setup.mockInput.pressEnter({ ctrl: true });
    setup.mockInput.pressKey("ESCAPE");
    expect(setup.answers).toHaveLength(1);
    setup.mockInput.pressEnter({ ctrl: true });
    expect(setup.answers).toEqual([
      { id: "yes", content: undefined },
      { id: "accept", content: { name: "answer!", enabled: false, note: "ready" } },
    ]);
  } finally {
    await setup.cleanup();
  }
});

test("help shortcuts validate collisions in every supported context", () => {
  expect(() => resolveKeybindings({ "app.help": ["enter"] })).toThrow("Keybinding conflict");
  expect(() => resolveKeybindings({ "app.help": ["ctrl+e"] })).toThrow("form.toggleJson");
  expect(() => resolveKeybindings({ "help.next": ["f1"] })).toThrow("app.help");
  expect(() => resolveKeybindings({ "app.commands": ["f1"] })).toThrow("Keybinding conflict");
  expect(() => resolveKeybindings({ "app.commands": ["f1"], "app.help": [] })).not.toThrow();
});
