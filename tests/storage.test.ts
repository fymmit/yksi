import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Storage, type StorageIssue } from "../src/storage";
import { addMessage, newSession } from "../src/state";

function database() {
  const directory = mkdtempSync(join(tmpdir(), "yksi-storage-"));
  return {
    path: join(directory, "history.sqlite"),
    dispose: () => rmSync(directory, { recursive: true, force: true }),
  };
}

test("history isolates invalid records and preserves legacy fields and ACP metadata", () => {
  const fixture = database();
  const storage = new Storage(fixture.path);
  const db = new Database(fixture.path);
  try {
    const session = newSession("demo", "/project");
    addMessage(session, "user", "old prompt");
    delete session.inputHistory;
    if (session.items[0]?.type === "message") delete session.items[0].createdAt;
    session.items.push({
      type: "tool",
      id: "local",
      toolCallId: "remote",
      title: "Tool",
      _meta: { vendor: { extra: true } },
    });
    storage.save(session);
    for (const [id, data] of Object.entries({
      malformed: "{",
      shape: JSON.stringify({ ...session, items: [{ type: "message", text: 1 }] }),
      nested: JSON.stringify({ ...session, configOptions: [{ type: "select", options: null }] }),
    })) {
      db.query("INSERT INTO sessions VALUES (?, ?, ?, ?)").run(id, "/project", 0, data);
    }
    const issues: StorageIssue[] = [];
    expect(storage.list("/project", issue => issues.push(issue))).toEqual([session]);
    expect(issues).toHaveLength(3);
    expect(db.query("SELECT count(*) AS count FROM sessions").get()).toEqual({ count: 4 });
  } finally {
    db.close();
    storage.close();
    fixture.dispose();
  }
});

test("settings validate JSON and key-specific value types", () => {
  const fixture = database();
  const storage = new Storage(fixture.path);
  const db = new Database(fixture.path);
  try {
    for (const [key, value] of [
      ["theme", "{"],
      ["sidebar", '"false"'],
      ["model:demo", "false"],
    ]) {
      db.query("INSERT INTO settings VALUES (?, ?)").run(key!, value!);
    }
    expect(storage.setting("theme", "dark")).toBe("dark");
    expect(storage.setting("sidebar", true)).toBe(true);
    expect(storage.setting("model:demo", undefined)).toBeUndefined();
    storage.setSetting("sidebar", false);
    storage.setSetting("model:demo", "model");
    expect(storage.setting("sidebar", true)).toBe(false);
    expect(storage.setting("model:demo", undefined)).toBe("model");
  } finally {
    db.close();
    storage.close();
    fixture.dispose();
  }
});

test("database initialization preserves existing data and rejects newer versions", () => {
  const fixture = database();
  try {
    let storage = new Storage(fixture.path);
    storage.setSetting("theme", "light");
    storage.close();
    const db = new Database(fixture.path);
    try {
      db.exec("PRAGMA user_version=0");
      storage = new Storage(fixture.path);
      expect(storage.setting("theme", "dark")).toBe("light");
      storage.close();
      expect(db.query("PRAGMA user_version").get()).toEqual({ user_version: 1 });
      db.exec("PRAGMA user_version=2");
      expect(() => new Storage(fixture.path)).toThrow("newer than supported");
      expect(db.query("PRAGMA user_version").get()).toEqual({ user_version: 2 });
    } finally {
      db.close();
    }
  } finally {
    fixture.dispose();
  }
});
