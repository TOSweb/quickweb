// src/db/sqlite.js — SQLite adapter
// Uses bun:sqlite when running under Bun, better-sqlite3 under Node.js (cPanel)
import { mkdirSync } from "fs";
import { join } from "path";

export async function createSQLiteAdapter(dbConfig) {
  mkdirSync(join(process.cwd(), "data"), { recursive: true });

  if (typeof Bun !== "undefined") {
    const { Database } = await import("bun:sqlite");
    const db = new Database(dbConfig.path, { create: true });
    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA foreign_keys = ON");

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

  // Node.js (cPanel / LiteSpeed)
  const { default: Database } = await import("better-sqlite3");
  const db = new Database(dbConfig.path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

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
      db.exec(sql);
      return Promise.resolve();
    },
  };
}
