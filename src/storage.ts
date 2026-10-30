import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Session } from "./state";

export class Storage {
  private db: Database;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new Database(path, { create: true });
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, cwd TEXT NOT NULL, updated_at INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      PRAGMA user_version=1;`);
  }
  save(session: Session) {
    this.db
      .query("INSERT OR REPLACE INTO sessions VALUES (?, ?, ?, ?)")
      .run(session.id, session.cwd, session.updatedAt, JSON.stringify(session));
  }
  list(cwd: string): Session[] {
    return (
      this.db
        .query("SELECT data FROM sessions WHERE cwd = ? ORDER BY updated_at DESC LIMIT 100")
        .all(cwd) as { data: string }[]
    ).map(row => JSON.parse(row.data));
  }
  setting<T>(key: string, fallback: T): T {
    const row = this.db.query("SELECT value FROM settings WHERE key = ?").get(key) as {
      value: string;
    } | null;
    return row ? JSON.parse(row.value) : fallback;
  }
  setSetting(key: string, value: unknown) {
    this.db.query("INSERT OR REPLACE INTO settings VALUES (?, ?)").run(key, JSON.stringify(value));
  }
  close() {
    this.db.close();
  }
}
