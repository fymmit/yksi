import { expect, test } from "bun:test";
import { addMessage, applyUpdate, changedFiles, newSession } from "../src/state";
import { Storage } from "../src/storage";

test("streamed messages retain boundaries and sparse tool updates preserve content", () => {
  const session = newSession("demo", "/project");
  addMessage(session, "user", "hello");
  applyUpdate(session, { sessionUpdate: "agent_message_chunk", messageId: "a", content: { type: "text", text: "Hello" } });
  applyUpdate(session, { sessionUpdate: "agent_message_chunk", messageId: "a", content: { type: "text", text: " world" } });
  applyUpdate(session, { sessionUpdate: "agent_message_chunk", messageId: "b", content: { type: "text", text: "Next message" } });
  expect(session.items).toHaveLength(3);
  expect(session.items[1]).toMatchObject({ text: "Hello world" });
  applyUpdate(session, { sessionUpdate: "tool_call", toolCallId: "tool", title: "Edit", status: "pending", content: [{ type: "diff", path: "/project/a.ts", oldText: "a", newText: "b" }] });
  applyUpdate(session, { sessionUpdate: "tool_call_update", toolCallId: "tool", status: "completed", title: null, content: null });
  expect(session.items[3]).toMatchObject({ title: "Edit", status: "completed", content: [{ path: "/project/a.ts" }] });
  expect(changedFiles(session)).toEqual(["/project/a.ts"]);
});

test("command and plan snapshots replace old values; persistence isolates workspaces", () => {
  const storage = new Storage(":memory:");
  try {
    const session = newSession("demo", "/a");
    applyUpdate(session, { sessionUpdate: "available_commands_update", availableCommands: [{ name: "old", description: "old" }] });
    applyUpdate(session, { sessionUpdate: "available_commands_update", availableCommands: [] });
    applyUpdate(session, { sessionUpdate: "plan", entries: [{ content: "Work", priority: "medium", status: "completed" }] });
    storage.save(session); storage.save(newSession("demo", "/b"));
    expect(storage.list("/a")).toEqual([session]);
    expect(storage.list("/a")[0]?.commands).toEqual([]);
    storage.setSetting("theme", "light");
    expect(storage.setting("theme", "dark")).toBe("light");
  } finally { storage.close(); }
});
