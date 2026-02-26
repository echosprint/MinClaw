import Database from 'better-sqlite3'

export type Role = 'user' | 'assistant'

export interface Message {
  id: number
  chat_id: string
  role: Role
  content: string
  created_at: number
}

export interface Job {
  id: number
  chat_id: string
  cron: string
  task: string
  next_run: number
  active: number
}

let _db: Database.Database

export function init(path = './minclaw.db') {
  _db = new Database(path)
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
      active    INTEGER DEFAULT 1
    );
  `)
}

export function saveMessage(chatId: string, role: Role, content: string): void {
  _db.prepare(
    'INSERT INTO messages (chat_id, role, content, created_at) VALUES (?, ?, ?, ?)'
  ).run(chatId, role, content, Date.now())
}

export function getHistory(chatId: string, limit = 20): Message[] {
  const rows = _db.prepare(
    'SELECT * FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT ?'
  ).all(chatId, limit) as Message[]
  return rows.reverse()
}

export function saveJob(
  chatId: string,
  cron: string,
  task: string,
  nextRun: number
): number {
  const result = _db.prepare(
    'INSERT INTO jobs (chat_id, cron, task, next_run) VALUES (?, ?, ?, ?)'
  ).run(chatId, cron, task, nextRun)
  return result.lastInsertRowid as number
}

export function getDueJobs(): Job[] {
  return _db.prepare(
    'SELECT * FROM jobs WHERE active = 1 AND next_run <= ?'
  ).all(Date.now()) as Job[]
}

export function advanceJob(id: number, nextRun: number): void {
  _db.prepare('UPDATE jobs SET next_run = ? WHERE id = ?').run(nextRun, id)
}

export function deactivateJob(id: number): void {
  _db.prepare('UPDATE jobs SET active = 0 WHERE id = ?').run(id)
}
