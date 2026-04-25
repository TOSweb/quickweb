# Veave CMS — Security Implementation Guide
> This document is mandatory reading before working on any security-related code.

---

## Golden Rules

1. **Prepared statements only.** No template literals in SQL. Ever. No exceptions.
2. **Sanitize on write, verify on read.** Never trust content from the DB without HMAC check.
3. **CSRF token on every state-changing request.** POST, PUT, DELETE always require it.
4. **Rate limit every public-facing auth endpoint.** Login, password reset, setup.
5. **Security headers on every response.** Not just admin, everywhere.
6. **Never expose internals in production.** No stack traces, no SQL errors, no debug output.
7. **Magic bytes over file extensions.** Filenames lie. Bytes don't.

---

## Threat Model

| Threat | Vector | Mitigation |
|--------|--------|------------|
| XSS | Stored HTML in components | Sanitizer allowlist + HMAC |
| XSS | Rich text in blog posts | Same sanitizer on save |
| CSRF | Form submissions | CSRF token per session |
| Clickjacking | Iframe embedding | X-Frame-Options + CSP frame-ancestors |
| SQL Injection | User input in queries | Prepared statements always |
| Brute force | Login form | IP-based rate limiter + lockout |
| File upload abuse | Malicious uploads | MIME type + magic bytes + safe naming |
| Path traversal | Upload filenames | UUID-based filenames, no user input in paths |
| DB tampering | Direct DB access | HMAC signature on component content |
| Session hijacking | Token theft | HttpOnly cookie, Secure flag in prod, short TTL |
| Privilege escalation | Permission bypass | Superuser flag separate, checked first |
| Timing attack | Token comparison | Constant-time comparison in all checks |

---

## Security Checklist Per Feature

### When adding a new admin form:
- [ ] Hidden `_csrf` field in form
- [ ] `csrfProtect()` middleware on POST handler
- [ ] `requireAuth()` middleware on handler
- [ ] `requirePermission()` middleware with correct codename
- [ ] Input validated server-side (never trust client)
- [ ] SQL via prepared statements

### When adding a new file input:
- [ ] Size check against config limit
- [ ] MIME type against allowlist
- [ ] Magic bytes verification
- [ ] UUID-based output filename
- [ ] Store outside webroot or serve via controlled route
- [ ] Alt text required for images

### When saving component HTML:
- [ ] Run through `sanitizeHtml()`
- [ ] Sign with `signContent()`
- [ ] Store both `content` and `hmac_signature`

### When rendering component HTML:
- [ ] Call `verifyAndRender(content, hmac_signature)`
- [ ] If invalid — log warning, render empty placeholder
- [ ] Never render unverified content

### When adding a new public route:
- [ ] Check redirects table first
- [ ] Confirm security headers applied via wrapper
- [ ] No internal paths accessible

---

## Known Acceptable Tradeoffs

**`unsafe-inline` in CSP:**
The inline editor requires `unsafe-inline` for scripts and styles. This is an acceptable tradeoff because:
- The editor is only loaded for authenticated users
- Component HTML is sanitized server-side before saving
- A future version should use nonces to replace `unsafe-inline`

**In-memory sessions:**
Sessions stored in a Map() reset on server restart. This is acceptable for v1 because:
- Admin users tolerate re-login after deploy
- A future version should move sessions to SQLite

**In-memory rate limiter:**
Rate limit state resets on restart. Acceptable for v1 — a determined attacker gets a fresh window after a restart, but this is a rare edge case for a single-server CMS.

---

## Security Contacts

Any suspected vulnerability in this codebase should be reported to the project lead before committing a fix. Do not push security fixes directly to main without review.
