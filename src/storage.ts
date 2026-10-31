import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Session } from "./state";
import { decodeSession } from "./session-codec";

export type Settings = { theme: string; sidebar: boolean; [key: `model:${string}`]: string };
export type StorageIssue = { id: string; message: string };
const SCHEMA_VERSION = 1;
const SESSION_LIST_LIMIT = 100;

export class Storage {
  private db: Database;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new Database(path, { create: true });
    try {
      const { user_version: version } = this.db.query("PRAGMA user_version").get() as {
        user_version: number;
      };
      if (version > SCHEMA_VERSION)
        throw new Error(
          `History database version ${version} is newer than supported version ${SCHEMA_VERSION}.`,
        );
      this.db.exec("PRAGMA journal_mode=WAL");
      if (version === 0)
        this.db.transaction(() =>
          this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, cwd TEXT NOT NULL, updated_at INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      PRAGMA user_version=${SCHEMA_VERSION};`),
        )();
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  save(session: Session) {
    this.db
      .query("INSERT OR REPLACE INTO sessions VALUES (?, ?, ?, ?)")
      .run(session.id, session.cwd, session.updatedAt, JSON.stringify(session));
  }
  list(cwd: string, invalid?: (issue: StorageIssue) => void): Session[] {
    const rows = this.db
      .query("SELECT id, data FROM sessions WHERE cwd = ? ORDER BY updated_at DESC LIMIT ?")
      .all(cwd, SESSION_LIST_LIMIT) as { id: string; data: string }[];
    const sessions: Session[] = [];
    for (const row of rows) {
      try {
        const session = decodeSession(row.data);
        if (session.id !== row.id || session.cwd !== cwd)
          throw new Error("Session identity does not match its stored row.");
        sessions.push(session);
      } catch (error) {
        invalid?.({ id: row.id, message: error instanceof Error ? error.message : String(error) });
      }
    }
    return sessions;
  }
  setting<K extends keyof Settings, F extends Settings[K] | null | undefined>(
    key: K,
    fallback: F,
  ): Settings[K] | F {
    const row = this.db.query("SELECT value FROM settings WHERE key = ?").get(key) as {
      value: string;
    } | null;
    if (!row) return fallback;
    try {
      const value: unknown = JSON.parse(row.value);
      return validSetting(key, value) ? value : fallback;
    } catch {
      return fallback;
    }
  }
  setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    if (!validSetting(key, value)) throw new Error(`Invalid setting: ${key}`);
    this.db.query("INSERT OR REPLACE INTO settings VALUES (?, ?)").run(key, JSON.stringify(value));
  }
  close() {
    this.db.close();
  }
}

function validSetting<K extends keyof Settings>(key: K, value: unknown): value is Settings[K] {
  return key === "sidebar"
    ? typeof value === "boolean"
    : (key === "theme" || key.startsWith("model:")) && typeof value === "string";
}
