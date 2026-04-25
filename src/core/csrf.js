// src/core/csrf.js
import { createHmac } from "crypto";
import config from "../config.js";

export function generateCsrfToken(sessionId) {
  if (!sessionId) return "";
  const hmac = createHmac("sha256", config.security.csrfSecret);
  hmac.update(sessionId);
  return hmac.digest("hex");
}

export function verifyCsrfToken(token, sessionId) {
  if (!token || !sessionId) return false;
  const expected = generateCsrfToken(sessionId);
  
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

// Minimal middleware, expects req._body or req._form to be already populated by router.js
export function csrfProtect(handler) {
  return async (req, params, session) => {
    const method = req.method;
    if (method === "POST" || method === "PUT" || method === "DELETE") {
      let token = "";
      
      if (req._body) {
        token = req._body._csrf;
      } else if (req._form) {
        token = req._form.get("_csrf");
      }
      
      if (!verifyCsrfToken(token, session.id)) {
        console.warn(`CSRF validation failed — user: ${session.username}, path: ${new URL(req.url).pathname}`);
        return new Response("Invalid request (CSRF)", { status: 403 });
      }
    }
    return handler(req, params, session);
  };
}
