// src/db/mysql.js — MySQL adapter (mysql2/promise pool with SQL normalization)
import mysql from "mysql2/promise";

// Transform SQLite-specific syntax to MySQL equivalents before executing
const NORMALIZATIONS = [
  [/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi,   "INSERT IGNORE INTO"],
  [/\bINSERT\s+OR\s+REPLACE\s+INTO\b/gi,  "REPLACE INTO"],
  // GROUP_CONCAT(expr, 'sep') → GROUP_CONCAT(expr SEPARATOR 'sep')
  [/GROUP_CONCAT\(([^,)]+),\s*'([^']*)'\)/g, "GROUP_CONCAT($1 SEPARATOR '$2')"],
];

function normalize(sql) {
  let out = sql;
  for (const [from, to] of NORMALIZATIONS) out = out.replace(from, to);
  return out;
}

export function createMySQLAdapter(dbConfig) {
  const pool = mysql.createPool({
    host:            dbConfig.host     || "localhost",
    port:            dbConfig.port     || 3306,
    database:        dbConfig.database,
    user:            dbConfig.user,
    password:        dbConfig.password,
    connectionLimit: dbConfig.connectionLimit || 10,
    waitForConnections: true,
    decimalNumbers: true,  // keep numeric columns as JS numbers, not BigInt
    timezone: "+00:00",
  });

  return {
    async all(sql, params = []) {
      const [rows] = await pool.execute(normalize(sql), params);
      return rows;
    },
    async get(sql, params = []) {
      const [rows] = await pool.execute(normalize(sql), params);
      return rows[0] ?? null;
    },
    async run(sql, params = []) {
      const [result] = await pool.execute(normalize(sql), params);
      return {
        changes: result.affectedRows ?? 0,
        lastInsertRowid: result.insertId ?? 0,
      };
    },
    async exec(sql) {
      // DDL statements — use query() which supports multi-statement if needed
      await pool.query(sql);
    },
  };
}
