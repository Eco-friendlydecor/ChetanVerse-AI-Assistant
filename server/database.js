import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const defaultPath = path.resolve('data', 'chetanverse.sqlite');

export function createDatabase(filePath = process.env.DATABASE_PATH || defaultPath) {
  if (filePath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Planning','Active','Paused','Completed')),
      color TEXT NOT NULL DEFAULT '#88d8ad',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 180),
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'Other' CHECK(category IN ('Work','Study','Personal','Health','Other')),
      priority TEXT NOT NULL DEFAULT 'Medium' CHECK(priority IN ('Low','Medium','High','Urgent')),
      status TEXT NOT NULL DEFAULT 'Todo' CHECK(status IN ('Todo','In progress','Blocked','Done')),
      due_date TEXT,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
    CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
  `);
  return db;
}
