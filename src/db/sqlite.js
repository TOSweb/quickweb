// src/db/sqlite.js — SQLite adapter (wraps bun:sqlite, returns Promises)
import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { join } from "path";

export function createSQLiteAdapter(dbConfig) {
  mkdirSync(join(process.cwd(), "data"), { recursive: true });
  const db = new Database(dbConfig.path);
  db.run("PRAGMA journal_mode = WAL;");
  db.run("PRAGMA foreign_keys = ON;");

  return {
    all(sql, params = []) {
      return Promise.resolve(db.prepare(sql).all(...params));
    },
    get(sql, params = []) {
      return Promise.resolve(db.prepare(sql).get(...params) ?? null);
    },
    run(sql, params = []) {
      const info = db.prepare(sql).run(...params);
      return Promise.resolve({
        changes: info.changes ?? 0,
        lastInsertRowid: Number(info.lastInsertRowid ?? 0),
      });
    },
    exec(sql) {
      db.run(sql);
      return Promise.resolve();
    },
  };
}
