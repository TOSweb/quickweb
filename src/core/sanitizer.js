// src/core/sanitizer.js
import { createHmac } from "crypto";
import config from "../config.js";

// Allowed HTML tags for static components
const ALLOWED_TAGS = new Set([
  "div", "section", "article", "aside", "main", "header", "footer", "nav",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "span", "strong", "em", "b", "i", "u", "s",
  "a", "img", "picture", "source",
  "ul", "ol", "li", "dl", "dt", "dd",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td",
  "form", "input", "textarea", "select", "option", "button", "label",
  "blockquote", "pre", "code",
  "hr", "br",
  "figure", "figcaption",
  "style",
]);

const BLOCKED_PATTERNS = [
  /on\w+\s*=/i,                         // Event handlers
  /javascript:/i,                        // javascript: URLs
  /data:text\/html/i,                   // data: HTML URLs
  /<script/i,                           // Script tags
  /expression\s*\(/i,                   // CSS expression()
  /vbscript:/i,
  /\beval\s*\(/i,
];

export function sanitizeHtml(html) {
  if (!html) return "";
  
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(html)) {
      throw new Error(`Blocked pattern detected: ${pattern.toString()}`);
    }
  }

  // Simple regex-based strip for v1 (as per spec)
  let sanitized = html;
  sanitized = sanitized.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g, (match, tag) => {
    if (!ALLOWED_TAGS.has(tag.toLowerCase())) return "";
    return match;
  });

  // Strip event handler attributes (double safety)
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "");
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*[^\s>]*/gi, "");

  return sanitized;
}

export function signContent(content) {
  const hmac = createHmac("sha256", config.security.hmacSecret);
  hmac.update(content || "");
  return hmac.digest("hex");
}

export function verifyContent(content, signature) {
  if (!content || !signature) return false;
  const expected = signContent(content);
  
  if (signature.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < signature.length; i++) {
    diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export function sanitizeAndSign(html) {
  const clean = sanitizeHtml(html);
  const signature = signContent(clean);
  return { content: clean, hmac_signature: signature };
}

export function verifyAndRender(content, signature) {
  if (!verifyContent(content, signature)) {
    console.error("SECURITY: Component HMAC verification failed. Possible DB tampering.");
    return `<!-- component signature invalid — rendering blocked -->`;
  }
  return content;
}
