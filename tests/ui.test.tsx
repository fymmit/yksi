import { expect, test } from "bun:test";
import { testRender } from "@opentui/solid";
import { App } from "../src/ui/app";
import { Controller } from "../src/controller";
import { Storage } from "../src/storage";
import { configSchema, demoAgent } from "../src/config";
import { resolve } from "node:path";
import { addMessage, applyUpdate } from "../src/state";

async function waitForWorkerFrame(
  setup: Awaited<ReturnType<typeof testRender>>,
  predicate: (frame: string) => boolean,
) {
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
  const setup = await testRender(
    () => <App controller={controller} quit={() => {}} autoConnect={false} />,
    { width: 110, height: 35 },
  );
  try {
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("What would you like to build?");
    await setup.mockInput.typeText("Keep this draft");
    setup.mockInput.pressKey("x", { ctrl: true });
    setup.mockInput.pressKey("p");
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Command palette");
    await setup.mockInput.typeText("Choose theme");
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Choose theme");
    setup.mockInput.pressEnter();
    await setup.renderOnce();
    await setup.mockInput.typeText("Light");
    setup.mockInput.pressEnter();
    await setup.renderOnce();
    expect(storage.setting("theme", "dark")).toBe("light");
    expect(setup.captureCharFrame()).toContain("Keep this draft");
    expect(setup.captureCharFrame()).not.toContain("Command palette");
    setup.resize(60, 20);
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Keep this draft");
    expect(setup.captureCharFrame()).toContain("F1 Help");
  } finally {
    controller.dispose();
    await setup.dispose();
    storage.close();
  }
});

test("reactive streaming and expanded diffs render after initial mount", async () => {
  const storage = new Storage(":memory:");
  const controller = new Controller(configSchema.parse({}), storage, "/project", "copilot");
  const setup = await testRender(
    () => <App controller={controller} quit={() => {}} autoConnect={false} />,
    { width: 100, height: 35 },
  );
  try {
    await setup.renderOnce();
    applyUpdate(controller.session, {
      sessionUpdate: "tool_call",
      toolCallId: "edit",
      title: "Edit greeting",
      status: "completed",
      content: [{ type: "diff", path: "/project/a.ts", oldText: "hello\n", newText: "goodbye\n" }],
    });
    applyUpdate(controller.session, {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "First chunk" },
    });
    controller.emit("change", controller.snapshot());
    // Tree-sitter highlighting runs in a worker, independently of renderer flushes.
    await waitForWorkerFrame(setup, frame => frame.includes("First chunk"));
    applyUpdate(controller.session, {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: " and second chunk." },
    });
    controller.emit("change", controller.snapshot());
    setup.mockInput.pressKey("x", { ctrl: true });
    setup.mockInput.pressKey("o");
    await waitForWorkerFrame(
      setup,
      frame => frame.includes("goodbye") && frame.includes("First chunk and second chunk."),
    );
    expect(setup.captureCharFrame()).toContain("First chunk and second chunk.");
    expect(setup.captureCharFrame()).toContain("goodbye");
  } finally {
    controller.dispose();
    await setup.dispose();
    storage.close();
  }
});

test("chat cards align by speaker with timestamps while tools and notices stay between cards", async () => {
  const storage = new Storage(":memory:");
  const controller = new Controller(configSchema.parse({}), storage, "/project", "copilot");
  const setup = await testRender(
    () => <App controller={controller} quit={() => {}} autoConnect={false} />,
    { width: 110, height: 35 },
  );
  try {
    await setup.renderOnce();
    addMessage(
      controller.session,
      "user",
      "Please review this",
      new Date(2025, 9, 29, 9, 5).getTime(),
    );
    applyUpdate(controller.session, {
      sessionUpdate: "tool_call",
      toolCallId: "read",
      title: "Read file",
      status: "completed",
    });
    applyUpdate(controller.session, {
      sessionUpdate: "agent_thought_chunk",
      content: { type: "text", text: "Private reasoning" },
    });
    applyUpdate(
      controller.session,
      { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Looks good." } },
      new Date(2024, 9, 30, 14, 32).getTime(),
    );
    addMessage(controller.session, "system", "Review complete");
    controller.emit("change", controller.snapshot());
    await waitForWorkerFrame(setup, frame => frame.includes("Looks good."));
    let frame = setup.captureCharFrame();
    expect(frame).toContain("You · Oct 29, 2025, 09:05");
    expect(frame).toContain("Assistant · Oct 30, 2024, 14:32");
    expect(frame.indexOf("Please review this")).toBeLessThan(frame.indexOf("Read file"));
    expect(frame.indexOf("Read file")).toBeLessThan(frame.indexOf("Looks good."));
    expect(frame.indexOf("Looks good.")).toBeLessThan(frame.indexOf("Review complete"));
    expect(frame).not.toContain("Private reasoning");
    const lines = frame.split("\n");
    const user = lines.find(line => line.includes("You ·"))!;
    const agent = lines.find(line => line.includes("Assistant ·"))!;
    const tool = lines.find(line => line.includes("Read file"))!;
    const notice = lines.find(line => line.includes("Review complete"))!;
    expect(user.indexOf("You ·")).toBeGreaterThan(agent.indexOf("Assistant ·"));
    expect(tool.indexOf("Read file")).toBeLessThan(user.indexOf("You ·"));
    expect(notice.indexOf("Review complete")).toBeLessThan(user.indexOf("You ·"));

    setup.resize(55, 30);
    await waitForWorkerFrame(
      setup,
      value => value.split("\n")[0]!.length <= 55 && value.includes("Looks good."),
    );
    frame = setup.captureCharFrame();
    expect(frame).toContain("Please review this");
    expect(frame).toContain("Assistant · Oct 30, 2024, 14:32");
    expect(
      frame
        .split("\n")
        .find(line => line.includes("You ·"))!
        .indexOf("You ·"),
    ).toBeGreaterThan(
      frame
        .split("\n")
        .find(line => line.includes("Assistant ·"))!
        .indexOf("Assistant ·"),
    );

    setup.mockInput.pressKey("x", { ctrl: true });
    setup.mockInput.pressKey("p");
    await setup.renderOnce();
    await setup.mockInput.typeText("Show / hide reasoning");
    setup.mockInput.pressEnter();
    await setup.renderOnce();
    frame = setup.captureCharFrame();
    expect(frame.indexOf("Read file")).toBeLessThan(frame.indexOf("Private reasoning"));
    expect(frame.indexOf("Private reasoning")).toBeLessThan(frame.indexOf("Looks good."));
    expect(
      frame
        .split("\n")
        .find(line => line.includes("Private reasoning"))!
        .indexOf("Private reasoning"),
    ).toBeLessThan(
      frame
        .split("\n")
        .find(line => line.includes("You ·"))!
        .indexOf("You ·"),
    );
  } finally {
    controller.dispose();
    await setup.dispose();
    storage.close();
  }
});

test("older transcripts render message cards without inventing timestamps", async () => {
  const storage = new Storage(":memory:");
  const controller = new Controller(configSchema.parse({}), storage, "/project", "copilot");
  controller.session.items.push({
    id: "legacy",
    type: "message",
    role: "user",
    text: "Old prompt",
  });
  const setup = await testRender(
    () => <App controller={controller} quit={() => {}} autoConnect={false} />,
    { width: 70, height: 20 },
  );
  try {
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    expect(frame).toContain("Old prompt");
    expect(frame.split("\n").some(line => /│ You\s+│/.test(line))).toBe(true);
  } finally {
    controller.dispose();
    await setup.dispose();
    storage.close();
  }
});

test("sidebar cost follows ACP snapshots including zero, missing cost and changed currency", async () => {
  const storage = new Storage(":memory:");
  const controller = new Controller(configSchema.parse({}), storage, "/project", "copilot");
  const setup = await testRender(
    () => <App controller={controller} quit={() => {}} autoConnect={false} />,
    { width: 110, height: 35 },
  );
  try {
    await setup.renderOnce();
    expect(setup.captureCharFrame()).not.toContain("Reported cost:");
    for (const [cost, label] of [
      [{ amount: 0.045, currency: "USD" }, "USD 0.05"],
      [{ amount: 0, currency: "USD" }, "USD 0.00"],
      [{ amount: 0.5, currency: "EUR" }, "EUR 0.50"],
      [undefined, "Not reported"],
      [null, "Not reported"],
    ] as const) {
      applyUpdate(controller.session, {
        sessionUpdate: "usage_update",
        used: 100,
        size: 200,
        cost,
      });
      controller.emit("change", controller.snapshot());
      await setup.renderOnce();
      expect(setup.captureCharFrame()).toContain("Reported cost:");
      expect(setup.captureCharFrame()).toContain(label);
      expect(setup.captureCharFrame()).toContain("Context: 100 / 200");
    }
  } finally {
    controller.dispose();
    await setup.dispose();
    storage.close();
  }
});

test("usage palette preserves the draft at narrow widths and the slash command runs locally", async () => {
  const storage = new Storage(":memory:");
  const controller = new Controller(
    configSchema.parse({ keybindings: { "app.usage": ["f2"] } }),
    storage,
    "/project",
    "copilot",
  );
  applyUpdate(
    controller.session,
    {
      sessionUpdate: "usage_update",
      used: 100,
      size: 200,
      cost: { amount: 0.045, currency: "USD" },
    },
    1000,
  );
  controller.status = "history";
  controller.error = "Agent cannot resume this transcript";
  const prompts: string[] = [];
  controller.send = async (text, _attachments, accepted) => {
    prompts.push(text);
    accepted?.();
  };
  const setup = await testRender(
    () => <App controller={controller} quit={() => {}} autoConnect={false} />,
    { width: 60, height: 24, kittyKeyboard: true },
  );
  try {
    await setup.renderOnce();
    await setup.mockInput.typeText("Keep this draft");
    setup.mockInput.pressKey("x", { ctrl: true });
    setup.mockInput.pressKey("p");
    await setup.renderOnce();
    await setup.mockInput.typeText("Show session usage");
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Show session usage");
    expect(setup.captureCharFrame()).toContain("F2");
    setup.mockInput.pressEnter();
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Reported session cost: USD 0.05");
    expect(setup.captureCharFrame()).toContain("Context: 100 / 200");
    expect(setup.captureCharFrame()).toContain("Last received:");
    expect(setup.captureCharFrame()).toContain("Keep this draft");
    expect(controller.error).toBeUndefined();

    setup.mockInput.pressKey("ESCAPE");
    await setup.renderOnce();
    expect(setup.captureCharFrame()).not.toContain("Reported session cost:");
    setup.mockInput.pressKey("F2");
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Reported session cost: USD 0.05");
    expect(setup.captureCharFrame()).toContain("Keep this draft");

    for (let i = 0; i < "Keep this draft".length; i++) setup.mockInput.pressKey("BACKSPACE");
    await setup.mockInput.typeText("/tui:usage");
    setup.mockInput.pressEnter();
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Reported session cost: USD 0.05");
    expect(prompts).toEqual([]);
    expect(controller.error).toBeUndefined();
    expect(setup.captureCharFrame()).not.toContain("/tui:usage");
  } finally {
    controller.dispose();
    await setup.dispose();
    storage.close();
  }
});

test("composer submits the editor buffer when text and Enter arrive together", async () => {
  const storage = new Storage(":memory:");
  const controller = new Controller(configSchema.parse({}), storage, "/project", "copilot");
  controller.status = "ready";
  const prompts: string[] = [];
  controller.send = async (text, _attachments, accepted) => {
    prompts.push(text);
    accepted?.();
  };
  const setup = await testRender(
    () => <App controller={controller} quit={() => {}} autoConnect={false} />,
    { width: 80, height: 24 },
  );
  try {
    await setup.renderOnce();
    await setup.mockInput.pressKeys(["h", "e", "l", "l", "o", "RETURN"], 0);
    await setup.renderOnce();
    expect(prompts).toEqual(["hello"]);
  } finally {
    controller.dispose();
    await setup.dispose();
    storage.close();
  }
});

test("offline demo form accepts keyboard answers without consuming the composer draft", async () => {
  const storage = new Storage(":memory:");
  const definition = demoAgent();
  definition.env.ACP_DEMO_FAST = "1";
  const controller = new Controller(
    configSchema.parse({ defaultAgent: "demo", agents: { demo: definition } }),
    storage,
    resolve(import.meta.dir, ".."),
    "demo",
  );
  const setup = await testRender(
    () => <App controller={controller} quit={() => {}} autoConnect={false} />,
    { width: 80, height: 30, kittyKeyboard: true },
  );
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
    setup.mockInput.pressKey(" ");
    setup.mockInput.pressArrow("down");
    setup.mockInput.pressKey(" ");
    setup.mockInput.pressEnter();
    setup.mockInput.pressKey("u", { ctrl: true });
    await turn;
    await setup.renderOnce();
    const last = controller.session.items.at(-1);
    expect(last?.type === "message" && JSON.parse(last.text.replace("Your answer: ", ""))).toEqual({
      action: "accept",
      content: {
        name: "keyboard-project",
        tests: false,
        template: "web",
        workers: 1,
        extras: ["docs", "ci"],
      },
    });
    expect(setup.captureCharFrame()).toContain("Keep my draft");
    expect(controller.snapshot().interaction).toBeUndefined();
    await setup.mockInput.typeText("!");
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Keep my draft!");
  } finally {
    controller.dispose();
    await setup.dispose();
    storage.close();
  }
}, 15_000);

test("queued forms reset values and errors while keeping the composer isolated", async () => {
  const storage = new Storage(":memory:");
  const definition = demoAgent();
  definition.args = [resolve(import.meta.dir, "fixtures/agent.ts")];
  const controller = new Controller(
    configSchema.parse({ defaultAgent: "demo", agents: { demo: definition } }),
    storage,
    resolve(import.meta.dir, ".."),
    "demo",
  );
  const setup = await testRender(
    () => <App controller={controller} quit={() => {}} autoConnect={false} />,
    { width: 60, height: 24, kittyKeyboard: true },
  );
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
    expect(last?.type === "message" && JSON.parse(last.text)).toEqual([
      { action: "accept", content: { name: "first-answer" } },
      { action: "decline" },
    ]);
    expect(setup.captureCharFrame()).toContain("Unchanged draft");
  } finally {
    controller.dispose();
    await setup.dispose();
    storage.close();
  }
}, 15_000);
