// src/core/auth.js — DB-persistent sessions
import { getDB } from "../db.js";
import config from "../config.js";

const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export function generateToken() {
  const isBun = typeof Bun !== "undefined";
  if (isBun) return Bun.randomUUIDv7();
  return crypto.randomUUID();
}

export async function hashPassword(password) {
  const isBun = typeof Bun !== "undefined";
  if (isBun) return Bun.password.hash(password);
  const { scrypt, randomBytes } = await import("crypto");
  const salt = randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      resolve(`${salt}:${key.toString("hex")}`);
    });
  });
}

export async function verifyPassword(password, hash) {
  const isBun = typeof Bun !== "undefined";
  if (isBun) return Bun.password.verify(password, hash);
  const { scrypt } = await import("crypto");
  const [salt, key] = hash.split(":");
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(derivedKey.toString("hex") === key);
    });
  });
}

export async function login(username, password) {
  const db = getDB();
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || user.is_active === 0) return null;

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return null;

  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION).toISOString();
  
  const sessionData = {
    userId: user.id,
    username: user.username,
    isSuperuser: !!user.is_superuser,
  };

  db.prepare(
    "INSERT INTO sessions (id, user_id, data, expires_at) VALUES (?, ?, ?, ?)"
  ).run(token, user.id, JSON.stringify(sessionData), expiresAt);
  
  db.run("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?", [user.id]);

  return token;
}

export function logout(token) {
  if (!token) return;
  getDB().prepare("DELETE FROM sessions WHERE id = ?").run(token);
}

export function getSession(token) {
  if (!token) return null;
  const db = getDB();
  const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(token);
  
  if (!row) return null;
  
  if (new Date(row.expires_at) < new Date()) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(token);
    return null;
  }

  try {
    const data = JSON.parse(row.data);
    return { ...data, id: row.id };
  } catch {
    return null;
  }
}

export function getTokenFromRequest(req) {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(/cms_token=([^;]+)/);
  return match ? match[1] : null;
}

export function requireAuth(handler) {
  return async (req, params) => {
    const token = getTokenFromRequest(req);
    const session = getSession(token);
    if (!session) {
      const url = new URL(req.url);
      if (url.pathname.startsWith("/admin/api")) return new Response("Unauthorized", { status: 401 });
      return Response.redirect("/admin/login", 302);
    }
    return handler(req, params, session);
  };
}

export async function createFirstAdmin(username, password) {
  const db = getDB();
  const existing = db.prepare("SELECT id FROM users LIMIT 1").get();
  if (existing) return false;

  const hash = await hashPassword(password);
  db.run("INSERT INTO users (username, password_hash, is_superuser) VALUES (?, ?, 1)", [username, hash]);
  return true;
}
