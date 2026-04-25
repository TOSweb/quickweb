// src/core/ratelimit.js
import config from "../config.js";

const attempts = new Map();

export function getClientIp(req) {
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}

export function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = config.rateLimit.loginWindowMinutes * 60 * 1000;
  const lockoutMs = config.rateLimit.loginLockoutMinutes * 60 * 1000;

  const record = attempts.get(ip) || { count: 0, firstAttempt: now, lockedUntil: null };

  if (record.lockedUntil && now < record.lockedUntil) {
    const remaining = Math.ceil((record.lockedUntil - now) / 60000);
    return { allowed: false, reason: `Too many attempts. Try again in ${remaining} minutes.` };
  }

  if (now - record.firstAttempt > windowMs) {
    attempts.set(ip, { count: 1, firstAttempt: now, lockedUntil: null });
    return { allowed: true };
  }

  record.count++;
  if (record.count >= config.rateLimit.loginMaxAttempts) {
    record.lockedUntil = now + lockoutMs;
    attempts.set(ip, record);
    return { allowed: false, reason: `Too many attempts. Try again in ${config.rateLimit.loginLockoutMinutes} minutes.` };
  }

  attempts.set(ip, record);
  return { allowed: true };
}

export function recordLoginSuccess(ip) {
  attempts.delete(ip);
}
