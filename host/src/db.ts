import Database from "better-sqlite3";
import fs from "fs";

export type Role = "user" | "assistant";

export interface Message {
  id: number;
  chat_id: string;
  role: Role;
  content: string;
  created_at: number;
}

export interface Job {
  id: number;
  chat_id: string;
  cron: string;
  task: string;
  next_run: number;
  active: number;
  one_shot: number;
}

let _db: Database.Database;

/*
 * messages — conversation history per chat, used to build prompt context.
 *            ORDER BY id (not created_at) to avoid same-ms collision on rapid inserts.
 * jobs     — scheduled tasks: next_run is a Unix ms timestamp; active=0 means inactive
 *            one_shot=1 means the job deactivates after its first successful run.
 */
export function init(path = "../data/db/minclaw.db") {
  fs.mkdirSync("../data/db", { recursive: true });
  _db = new Database(path);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id    TEXT    NOT NULL,
      role       TEXT    NOT NULL,
      content    TEXT    NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id   TEXT    NOT NULL,
      cron      TEXT    NOT NULL,
      task      TEXT    NOT NULL,
      next_run  INTEGER NOT NULL,
      active    INTEGER DEFAULT 1,
      one_shot  INTEGER DEFAULT 0
    );
  `);
  // migrate existing db
  try {
    _db.exec("ALTER TABLE jobs ADD COLUMN one_shot INTEGER DEFAULT 0");
  } catch {}
}

export function saveMessage(chatId: string, role: Role, content: string): void {
  _db
    .prepare("INSERT INTO messages (chat_id, role, content, created_at) VALUES (?, ?, ?, ?)")
    .run(chatId, role, content, Date.now());
}

export function clearHistory(chatId: string): void {
  _db.prepare("DELETE FROM messages WHERE chat_id = ?").run(chatId);
}

export function getHistory(chatId: string, limit = 20): Message[] {
  const rows = _db
    .prepare("SELECT * FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT ?")
    .all(chatId, limit) as Message[];
  return rows.reverse();
}

export function addJob(
  chatId: string,
  cron: string,
  task: string,
  nextRun: number,
  oneShot = false,
): number {
  const result = _db
    .prepare("INSERT INTO jobs (chat_id, cron, task, next_run, one_shot) VALUES (?, ?, ?, ?, ?)")
    .run(chatId, cron, task, nextRun, oneShot ? 1 : 0);
  return result.lastInsertRowid as number;
}

export function getDueJobs(): Job[] {
  return _db
    .prepare("SELECT * FROM jobs WHERE active = 1 AND next_run <= ?")
    .all(Date.now()) as Job[];
}

// Advance a recurring job to its next cron tick after it has fired.
export function advanceJob(id: number, nextRun: number): void {
  _db.prepare("UPDATE jobs SET next_run = ? WHERE id = ?").run(nextRun, id);
}

export function deactivateJob(id: number): void {
  _db.prepare("UPDATE jobs SET active = 0 WHERE id = ?").run(id);
}

export function getActiveJobs(chatId: string): Job[] {
  return _db
    .prepare("SELECT * FROM jobs WHERE chat_id = ? AND active = 1 ORDER BY id")
    .all(chatId) as Job[];
}

export function cancelJob(id: number, chatId: string): boolean {
  const result = _db
    .prepare("UPDATE jobs SET active = 0 WHERE id = ? AND chat_id = ?")
    .run(id, chatId);
  return result.changes > 0;
}
