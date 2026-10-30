import { expect, test } from "bun:test";
import { addMessage, applyUpdate, changedFiles, newSession } from "../src/state";
import { Storage } from "../src/storage";

test("streamed messages retain boundaries and sparse tool updates preserve content", () => {
  const session = newSession("demo", "/project");
  addMessage(session, "user", "hello");
  applyUpdate(session, {
    sessionUpdate: "agent_message_chunk",
    messageId: "a",
    content: { type: "text", text: "Hello" },
  });
  applyUpdate(session, {
    sessionUpdate: "agent_message_chunk",
    messageId: "a",
    content: { type: "text", text: " world" },
  });
  applyUpdate(session, {
    sessionUpdate: "agent_message_chunk",
    messageId: "b",
    content: { type: "text", text: "Next message" },
  });
  expect(session.items).toHaveLength(3);
  expect(session.items[1]).toMatchObject({ text: "Hello world" });
  applyUpdate(session, {
    sessionUpdate: "tool_call",
    toolCallId: "tool",
    title: "Edit",
    status: "pending",
    content: [{ type: "diff", path: "/project/a.ts", oldText: "a", newText: "b" }],
  });
  applyUpdate(session, {
    sessionUpdate: "tool_call_update",
    toolCallId: "tool",
    status: "completed",
    title: null,
    content: null,
  });
  expect(session.items[3]).toMatchObject({
    title: "Edit",
    status: "completed",
    content: [{ path: "/project/a.ts" }],
  });
  expect(changedFiles(session)).toEqual(["/project/a.ts"]);
});

test("command and plan snapshots replace old values; persistence isolates workspaces", () => {
  const storage = new Storage(":memory:");
  try {
    const session = newSession("demo", "/a");
    applyUpdate(session, {
      sessionUpdate: "available_commands_update",
      availableCommands: [{ name: "old", description: "old" }],
    });
    applyUpdate(session, { sessionUpdate: "available_commands_update", availableCommands: [] });
    applyUpdate(session, {
      sessionUpdate: "plan",
      entries: [{ content: "Work", priority: "medium", status: "completed" }],
    });
    storage.save(session);
    storage.save(newSession("demo", "/b"));
    expect(storage.list("/a")).toEqual([session]);
    expect(storage.list("/a")[0]?.commands).toEqual([]);
    storage.setSetting("theme", "light");
    expect(storage.setting("theme", "dark")).toBe("light");
  } finally {
    storage.close();
  }
});

test("usage snapshots replace cumulative costs and persist their local receipt time", () => {
  const storage = new Storage(":memory:");
  const session = newSession("demo", "/project");
  try {
    for (const amount of [1, 1, 0.25, 0]) {
      applyUpdate(
        session,
        {
          sessionUpdate: "usage_update",
          used: 100,
          size: 200000,
          cost: { amount, currency: "USD" },
        },
        1000,
      );
      expect(session.usage?.cost?.amount).toBe(amount);
    }
    applyUpdate(
      session,
      {
        sessionUpdate: "usage_update",
        used: 200,
        size: 200000,
        cost: { amount: 0.5, currency: "EUR" },
      },
      2000,
    );
    storage.save(session);
    expect(storage.list(session.cwd)[0]?.usage?.cost).toEqual({ amount: 0.5, currency: "EUR" });
    expect(storage.list(session.cwd)[0]?.usageUpdatedAt).toBe(2000);
    addMessage(session, "agent", "Another update");
    expect(session.usageUpdatedAt).toBe(2000);

    applyUpdate(session, { sessionUpdate: "usage_update", used: 300, size: 200000 }, 3000);
    expect(session.usage?.cost).toBeUndefined();
    expect(session.usageUpdatedAt).toBe(3000);
    applyUpdate(
      session,
      { sessionUpdate: "usage_update", used: 400, size: 200000, cost: null },
      4000,
    );
    expect(session.usage?.cost).toBeNull();
    storage.save(session);
    expect(storage.list(session.cwd)[0]?.usage?.cost).toBeNull();
    expect(storage.list(session.cwd)[0]?.usageUpdatedAt).toBe(4000);
  } finally {
    storage.close();
  }
});
