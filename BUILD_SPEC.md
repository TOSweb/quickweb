# Veave CMS — Build Specification
> Internal developer document. Read this before touching any code.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Repository Structure](#2-repository-structure)
3. [Environment Configuration](#3-environment-configuration)
4. [Database Schema](#4-database-schema)
5. [Security Layer](#5-security-layer)
6. [Permission System](#6-permission-system)
7. [Page & Component Architecture](#7-page--component-architecture)
8. [Template Tag System](#8-template-tag-system)
9. [Blog Module](#9-blog-module)
10. [SEO & Sitemap](#10-seo--sitemap)
11. [Admin Panel](#11-admin-panel)
12. [Inline Editor](#12-inline-editor)
13. [Build & Deployment](#13-build--deployment)
14. [What To Build — Ordered Checklist](#14-what-to-build--ordered-checklist)

---

## 1. Project Overview

Veave CMS is a hybrid page-builder CMS built on Bun + JavaScript + SQLite.

**Core philosophy:**
- Security first, then features
- Django-level permission granularity
- Single binary deployment on cheap VPS
- No PHP, no MySQL, no runtime dependencies

**Two types of sites this CMS serves:**
- Marketing/brochure sites built with the page builder
- Content sites using the built-in Blog module

Both can exist on the same installation.

---

## 2. Repository Structure

```
veavecms/
├── src/
│   ├── index.js                  Entry point
│   ├── router.js                 Public request router
│   ├── db.js                     Schema + DB init
│   ├── admin/
│   │   ├── router.js             Admin panel routes
│   │   ├── pages.js              Page CRUD
│   │   ├── components.js         Component CRUD
│   │   ├── blog.js               Blog post management
│   │   ├── media.js              File upload handler
│   │   ├── users.js              User + group management
│   │   └── settings.js           Site settings
│   ├── core/
│   │   ├── auth.js               Sessions, login, password hashing
│   │   ├── permissions.js        Permission engine
│   │   ├── theme.js              Nunjucks engine
│   │   ├── tags.js               Custom tag registry
│   │   ├── builtins.js           Built-in template tags
│   │   ├── plugins.js            Plugin loader
│   │   ├── sanitizer.js          HTML sanitization + HMAC signing
│   │   ├── csrf.js               CSRF token management
│   │   └── update.js             Self-update mechanism
│   ├── seo/
│   │   ├── sitemap.js            Sitemap XML generator
│   │   ├── meta.js               SEO meta tag builder
│   │   └── schema.js             JSON-LD schema generator
│   └── api/
│       └── router.js             REST API (headless mode)
├── themes/
│   └── default/
│       ├── index.html
│       ├── page.html
│       ├── post.html
│       ├── post-list.html
│       ├── theme.json
│       ├── templatetags/         Theme-specific tags
│       └── assets/
│           ├── css/style.css
│           └── js/editor.js      Inline editor client script
├── plugins/                      Drop plugin folders here
├── data/
│   ├── cms.db                    SQLite database (auto-created)
│   └── uploads/                  Media uploads
├── config/
│   ├── production.js             Production config
│   └── development.js            Dev/staging config
├── docs/
│   ├── BUILD_SPEC.md             This file
│   ├── SECURITY.md               Security implementation guide
│   └── PLUGIN_API.md             Plugin developer guide
├── .env.production               Production secrets
├── .env.development              Dev/staging secrets
├── .gitignore
└── package.json
```

---

## 3. Environment Configuration

### Two config files — one for each environment

**Never commit `.env.*` files to git. Commit only the `.example` versions.**

```
config/
  production.js     → loaded when NODE_ENV=production
  development.js    → loaded when NODE_ENV=development or staging
```

### `config/development.js`

```javascript
export default {
  env: "development",
  debug: true,                          // Enables debug panel, verbose errors
  port: 8080,
  domain: "localhost",
  siteUrl: "http://localhost:8080",

  db: {
    path: "./data/cms-dev.db",          // Separate DB from production
  },

  security: {
    sessionSecret: process.env.SESSION_SECRET,
    hmacSecret: process.env.HMAC_SECRET,
    csrfSecret: process.env.CSRF_SECRET,
    cookieSecure: false,                // HTTP allowed in dev
    cookieSameSite: "Lax",
  },

  uploads: {
    maxSizeMb: 10,
    path: "./data/uploads",
    allowedMimeTypes: [
      "image/jpeg", "image/png", "image/webp",
      "image/gif", "image/svg+xml",
      "application/pdf",
    ],
  },

  rateLimit: {
    loginMaxAttempts: 10,               // More lenient in dev
    loginWindowMinutes: 5,
    loginLockoutMinutes: 5,
  },

  cache: {
    sitemapTtlSeconds: 60,             // Regenerate frequently in dev
    templateCache: false,              // Always reload templates
  },

  debug: {
    showSqlErrors: true,
    showStackTraces: true,
    logRequests: true,
  }
};
```

### `config/production.js`

```javascript
export default {
  env: "production",
  debug: false,
  port: process.env.PORT || 8080,
  domain: process.env.DOMAIN,           // e.g. "example.com"
  siteUrl: process.env.SITE_URL,        // e.g. "https://example.com"

  db: {
    path: process.env.DB_PATH || "./data/cms.db",
  },

  security: {
    sessionSecret: process.env.SESSION_SECRET,  // Must be set, no default
    hmacSecret: process.env.HMAC_SECRET,         // Must be set, no default
    csrfSecret: process.env.CSRF_SECRET,         // Must be set, no default
    cookieSecure: true,                          // HTTPS only
    cookieSameSite: "Strict",
    hsts: true,                                  // Strict-Transport-Security header
    hstsMaxAge: 31536000,                        // 1 year
  },

  uploads: {
    maxSizeMb: 10,
    path: process.env.UPLOAD_PATH || "./data/uploads",
    allowedMimeTypes: [
      "image/jpeg", "image/png", "image/webp",
      "image/gif", "image/svg+xml",
      "application/pdf",
    ],
  },

  rateLimit: {
    loginMaxAttempts: 5,
    loginWindowMinutes: 15,
    loginLockoutMinutes: 30,
  },

  cache: {
    sitemapTtlSeconds: 3600,
    templateCache: true,
  },

  debug: {
    showSqlErrors: false,               // Never expose SQL errors in production
    showStackTraces: false,
    logRequests: false,
  }
};
```

### Loading config at startup

```javascript
// src/config.js
const env = process.env.NODE_ENV || "development";
const config = await import(`../config/${env}.js`);
export default config.default;
```

### `.env.production` (template — never commit real values)

```bash
NODE_ENV=production
PORT=8080
DOMAIN=example.com
SITE_URL=https://example.com
DB_PATH=./data/cms.db
UPLOAD_PATH=./data/uploads

# Generate with: openssl rand -hex 64
SESSION_SECRET=
HMAC_SECRET=
CSRF_SECRET=
```

### `.env.development`

```bash
NODE_ENV=development
SESSION_SECRET=dev-session-secret-not-for-production
HMAC_SECRET=dev-hmac-secret-not-for-production
CSRF_SECRET=dev-csrf-secret-not-for-production
```

### Debug mode behaviour

When `debug: true`:
- A debug bar appears at the bottom of every admin page showing: current user, session ID, permissions loaded, DB query count, render time
- SQL errors are shown in full in the browser
- Stack traces are shown on 500 errors instead of generic error page
- Template cache is disabled so changes appear immediately
- Request logging prints every request to stdout

When `debug: false` (production):
- All errors return a generic 500 page with no details
- SQL errors are logged server-side only, never sent to browser
- No debug bar anywhere

---

## 4. Database Schema

All tables use `INTEGER PRIMARY KEY AUTOINCREMENT`. All timestamps are `DATETIME DEFAULT CURRENT_TIMESTAMP`.

### Auth Tables

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  is_superuser INTEGER DEFAULT 0,        -- Superuser bypasses all permission checks
  last_login DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,             -- e.g. "Editors", "Developers"
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_groups (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, group_id)
);

-- Auto-generated permissions. One row per action per object.
-- codename format: "action_objecttype" e.g. "edit_page", "publish_page"
-- object_id: NULL means applies to all objects of that type
--            set to a specific ID means applies only to that object
CREATE TABLE permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codename TEXT NOT NULL,                -- e.g. "edit_page", "publish_blogpost"
  name TEXT NOT NULL,                    -- Human readable: "Can edit page"
  object_type TEXT NOT NULL,            -- "page", "blogpost", "component", "media"
  object_id INTEGER,                    -- NULL = type-level, set = object-level
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(codename, object_type, object_id)
);

CREATE TABLE group_permissions (
  group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
  permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, permission_id)
);

CREATE TABLE user_permissions (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, permission_id)
);

CREATE TABLE login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  username TEXT,
  success INTEGER DEFAULT 0,
  attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Page & Component Tables

```sql
CREATE TABLE pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,             -- User-controlled URL segment
  canonical_url TEXT,                    -- Override full URL if needed
  status TEXT DEFAULT 'draft',           -- draft | published | scheduled
  template TEXT DEFAULT 'page',          -- Which theme template to use
  publish_at DATETIME,                   -- Scheduled publish
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE components (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                    -- Human name e.g. "Homepage Hero"
  type TEXT NOT NULL,                    -- "static" | "dynamic"

  -- Static: sanitized HTML/CSS/JS stored here
  -- Dynamic: just the tag string e.g. "{% recentposts limit=5 %}"
  content TEXT,

  -- HMAC-SHA256 signature of content — verified at render time
  -- If signature doesn't match, component refuses to render
  hmac_signature TEXT NOT NULL,

  -- For static components, what fields are editable in content mode
  -- JSON array: [{"selector": "h1", "type": "text"}, {"selector": "img", "type": "image"}]
  editable_regions TEXT DEFAULT '[]',

  is_global INTEGER DEFAULT 0,          -- Global components appear on every page
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Join table: which components are on which page, in what order
CREATE TABLE page_components (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER REFERENCES pages(id) ON DELETE CASCADE,
  component_id INTEGER REFERENCES components(id) ON DELETE RESTRICT,
  sort_order INTEGER DEFAULT 0,
  UNIQUE(page_id, component_id)
);

CREATE TABLE redirects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_url TEXT UNIQUE NOT NULL,
  to_url TEXT NOT NULL,
  status_code INTEGER DEFAULT 301,       -- 301 permanent | 302 temporary
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Blog Tables

```sql
CREATE TABLE blog_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  canonical_url TEXT,

  content TEXT,                          -- Rich text HTML (sanitized on save)
  excerpt TEXT,
  featured_image TEXT,
  featured_image_alt TEXT,

  -- SEO fields (separate from title — can be different for search engines)
  seo_title TEXT,
  meta_description TEXT,
  og_title TEXT,
  og_description TEXT,
  og_image TEXT,
  schema_type TEXT DEFAULT 'BlogPosting', -- BlogPosting | Article | NewsArticle

  status TEXT DEFAULT 'draft',           -- draft | published | scheduled
  publish_at DATETIME,

  author_id INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE blog_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  meta_description TEXT
);

CREATE TABLE blog_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL
);

CREATE TABLE blog_post_categories (
  post_id INTEGER REFERENCES blog_posts(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES blog_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, category_id)
);

CREATE TABLE blog_post_tags (
  post_id INTEGER REFERENCES blog_posts(id) ON DELETE CASCADE,
  tag_id INTEGER REFERENCES blog_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);
```

### Settings & SEO Tables

```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Pre-seeded settings keys (all must exist after initDB):
-- site_title, site_tagline, site_url, active_theme
-- posts_per_page, cms_version, google_analytics_id
-- sitemap_include_pages, sitemap_include_posts

CREATE TABLE media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,               -- Stored filename on disk (uuid-based)
  original_name TEXT,                   -- Original upload name
  path TEXT NOT NULL,                   -- Relative path from uploads root
  url TEXT NOT NULL,                    -- Public URL
  mime_type TEXT NOT NULL,
  size INTEGER,                         -- Bytes
  width INTEGER,                        -- For images
  height INTEGER,                       -- For images
  alt_text TEXT,
  uploaded_by INTEGER REFERENCES users(id),
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 5. Security Layer

This section defines every security mechanism. All of these are required before any feature ships.

### 5.1 CSRF Protection

**File:** `src/core/csrf.js`

Every state-changing request (POST, PUT, DELETE) must include a valid CSRF token.

**How it works:**

1. When a session is created, generate a CSRF token tied to that session
2. Every admin form renders a hidden field `<input type="hidden" name="_csrf" value="TOKEN">`
3. On every POST request, verify the token before doing anything else
4. If token missing or invalid → reject with 403, log the attempt

```javascript
// src/core/csrf.js

import { createHmac } from "crypto";
import config from "../config.js";

export function generateCsrfToken(sessionId) {
  const hmac = createHmac("sha256", config.security.csrfSecret);
  hmac.update(sessionId);
  return hmac.digest("hex");
}

export function verifyCsrfToken(token, sessionId) {
  if (!token || !sessionId) return false;
  const expected = generateCsrfToken(sessionId);
  // Constant-time comparison to prevent timing attacks
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

// Middleware wrapper
export function csrfProtect(handler) {
  return async (req, params, session) => {
    if (req.method === "POST" || req.method === "PUT" || req.method === "DELETE") {
      const form = await req.formData();
      const token = form.get("_csrf");
      if (!verifyCsrfToken(token, session.id)) {
        console.warn(`CSRF validation failed — user: ${session.username}, path: ${new URL(req.url).pathname}`);
        return new Response("Invalid request", { status: 403 });
      }
      // Re-attach formData to request so handler can read it
      req._form = form;
    }
    return handler(req, params, session);
  };
}
```

**In every admin form:**

```html
<form method="POST" action="/admin/pages/new">
  <input type="hidden" name="_csrf" value="{{ csrf_token }}">
  <!-- rest of form -->
</form>
```

The `csrf_token` global must be available in every admin template via the session.

### 5.2 Clickjacking Protection

**File:** `src/core/headers.js`

Set on every response:

```javascript
export function securityHeaders(response, config) {
  const headers = new Headers(response.headers);

  // Prevent this site being loaded in an iframe (clickjacking)
  headers.set("X-Frame-Options", "DENY");

  // Modern clickjacking protection
  headers.set("Content-Security-Policy", buildCsp(config));

  // Prevent MIME type sniffing
  headers.set("X-Content-Type-Options", "nosniff");

  // Don't send referrer to external sites
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions policy — disable unnecessary browser features
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  // HSTS — production only
  if (config.security.hsts) {
    headers.set(
      "Strict-Transport-Security",
      `max-age=${config.security.hstsMaxAge}; includeSubDomains`
    );
  }

  return new Response(response.body, { status: response.status, headers });
}

function buildCsp(config) {
  const directives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",  // unsafe-inline needed for inline editor
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",             // Clickjacking — same as X-Frame-Options
    "base-uri 'self'",
    "form-action 'self'",
  ];
  return directives.join("; ");
}
```

Apply this wrapper to every response in `router.js`:

```javascript
import { securityHeaders } from "./core/headers.js";

export async function router(req) {
  const response = await handleRequest(req);
  return securityHeaders(response, config);
}
```

### 5.3 SQL Injection Prevention

**Rule: Zero raw string interpolation in SQL. Ever.**

All queries must use prepared statements with `?` placeholders.

```javascript
// ✅ CORRECT — always do this
const post = db.prepare("SELECT * FROM blog_posts WHERE slug = ?").get(slug);
const posts = db.prepare("SELECT * FROM blog_posts WHERE status = ? LIMIT ?").all(status, limit);

// ❌ NEVER do this — immediate code review rejection
const post = db.run(`SELECT * FROM blog_posts WHERE slug = '${slug}'`);
```

**Lint rule:** Add a custom ESLint rule (or a pre-commit git hook) that rejects any file containing a template literal inside `db.run(` or `db.prepare(`. This is non-negotiable.

```bash
# pre-commit hook: .git/hooks/pre-commit
#!/bin/bash
if git diff --cached --name-only | xargs grep -l "db\.run\`\|db\.prepare\`" 2>/dev/null; then
  echo "ERROR: Raw template literals in DB queries detected. Use prepared statements."
  exit 1
fi
```

### 5.4 Component Sanitization + HMAC Signing

**File:** `src/core/sanitizer.js`

Before any static component HTML is saved to the database, it must be:

1. Sanitized through an allowlist filter
2. Signed with HMAC-SHA256
3. The signature stored alongside the content

At render time:

1. Verify HMAC signature
2. If invalid — refuse to render, log a security alert, show placeholder
3. If valid — render the content

```javascript
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
  "style",                              // Allow <style> blocks for component CSS
]);

// Allowed attributes per tag
const ALLOWED_ATTRS = new Set([
  "id", "class", "style",
  "href", "src", "alt", "title", "target", "rel",
  "width", "height", "loading",
  "type", "name", "value", "placeholder", "required", "disabled",
  "data-*",                             // Allow data attributes
  "aria-*",                             // Allow ARIA
  "role",
]);

// Blocked regardless of tag or attribute
const BLOCKED_PATTERNS = [
  /on\w+\s*=/i,                         // Event handlers: onclick, onerror, etc.
  /javascript:/i,                        // javascript: URLs
  /data:text\/html/i,                   // data: HTML URLs
  /<script/i,                           // Script tags (not in ALLOWED_TAGS but double-check)
  /expression\s*\(/i,                   // CSS expression()
  /vbscript:/i,
  /\beval\s*\(/i,
];

export function sanitizeHtml(html) {
  // Check for blocked patterns first
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(html)) {
      throw new Error(`Blocked pattern detected: ${pattern.toString()}`);
    }
  }

  // Parse and filter tags
  // Use a simple regex-based approach — for production consider using
  // the 'sanitize-html' npm package with a custom allowlist
  let sanitized = html;

  // Strip tags not in allowlist
  sanitized = sanitized.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g, (match, tag) => {
    if (!ALLOWED_TAGS.has(tag.toLowerCase())) return "";
    return match;
  });

  // Strip event handler attributes
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "");
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*[^\s>]*/gi, "");

  return sanitized;
}

export function signContent(content) {
  const hmac = createHmac("sha256", config.security.hmacSecret);
  hmac.update(content);
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

// Call this before saving any component to DB
export function sanitizeAndSign(html) {
  const clean = sanitizeHtml(html);
  const signature = signContent(clean);
  return { content: clean, hmac_signature: signature };
}

// Call this before rendering any component from DB
export function verifyAndRender(content, signature) {
  if (!verifyContent(content, signature)) {
    console.error("SECURITY: Component HMAC verification failed. Possible DB tampering.");
    return `<!-- component signature invalid — rendering blocked -->`;
  }
  return content;
}
```

### 5.5 Rate Limiting (Login)

**File:** `src/core/ratelimit.js`

```javascript
// In-memory rate limiter per IP
const attempts = new Map();

export function checkRateLimit(ip, config) {
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
  }
  attempts.set(ip, record);

  return { allowed: record.count < config.rateLimit.loginMaxAttempts };
}

export function recordSuccess(ip) {
  attempts.delete(ip);  // Clear on successful login
}
```

### 5.6 Secure File Uploads

**File:** `src/admin/media.js`

```javascript
import { createHash } from "crypto";
import { extname } from "path";
import config from "../config.js";

const MAGIC_BYTES = {
  "image/jpeg": [[0xFF, 0xD8, 0xFF]],
  "image/png":  [[0x89, 0x50, 0x4E, 0x47]],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]],
  "image/gif":  [[0x47, 0x49, 0x46, 0x38]],
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]],
};

export async function validateUpload(file) {
  // 1. Check file size
  if (file.size > config.uploads.maxSizeMb * 1024 * 1024) {
    throw new Error(`File too large. Max ${config.uploads.maxSizeMb}MB.`);
  }

  // 2. Check declared MIME type against allowlist
  if (!config.uploads.allowedMimeTypes.includes(file.type)) {
    throw new Error(`File type not allowed: ${file.type}`);
  }

  // 3. Verify actual file content via magic bytes
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer.slice(0, 8));
  const validMagic = MAGIC_BYTES[file.type];

  if (validMagic) {
    const matched = validMagic.some(magic =>
      magic.every((byte, i) => bytes[i] === byte)
    );
    if (!matched) throw new Error("File content does not match declared type.");
  }

  // 4. Generate safe filename (UUID-based, no path traversal possible)
  const ext = extname(file.name).toLowerCase();
  const safeName = `${crypto.randomUUID()}${ext}`;

  return { safeName, buffer, mimeType: file.type };
}
```

---

## 6. Permission System

### 6.1 Concept

Every object in the CMS has auto-generated permissions when it is created. This mirrors Django's system exactly.

When a `Page` is created with id=5 and slug="about":
```
view_page       object_type=page  object_id=5
edit_page       object_type=page  object_id=5
publish_page    object_type=page  object_id=5
delete_page     object_type=page  object_id=5
```

When a `Component` is created with id=12:
```
edit_content_component    object_type=component  object_id=12  (content mode only)
edit_structure_component  object_type=component  object_id=12  (structure + code)
```

Type-level permissions (object_id=NULL) grant access to all objects of that type:
```
view_page    object_type=page  object_id=NULL  → can view ALL pages
edit_page    object_type=page  object_id=NULL  → can edit ALL pages
```

Superusers bypass all permission checks.

### 6.2 Permission Engine

**File:** `src/core/permissions.js`

```javascript
import { getDB } from "../db.js";

// Auto-create permissions when an object is created
// Call this inside the transaction that creates the object
export function createObjectPermissions(objectType, objectId) {
  const db = getDB();
  const actions = getActionsForType(objectType);

  for (const action of actions) {
    const codename = `${action}_${objectType}`;
    const name = `Can ${action} ${objectType} #${objectId}`;
    db.run(
      `INSERT OR IGNORE INTO permissions (codename, name, object_type, object_id)
       VALUES (?, ?, ?, ?)`,
      [codename, name, objectType, objectId]
    );
  }
}

// Delete permissions when object is deleted
export function deleteObjectPermissions(objectType, objectId) {
  getDB().run(
    "DELETE FROM permissions WHERE object_type = ? AND object_id = ?",
    [objectType, objectId]
  );
}

function getActionsForType(objectType) {
  const actions = {
    page:       ["view", "edit", "publish", "delete"],
    component:  ["edit_content", "edit_structure"],
    blogpost:   ["view", "edit", "publish", "delete"],
    media:      ["view", "upload", "delete"],
    user:       ["view", "edit", "delete"],
    settings:   ["view", "edit"],
  };
  return actions[objectType] || ["view", "edit", "delete"];
}

// Check if a user has a permission
// Checks: superuser → direct user permission → group permissions
export function hasPermission(userId, codename, objectType, objectId = null) {
  const db = getDB();

  // Superuser bypasses everything
  const user = db.prepare("SELECT is_superuser FROM users WHERE id = ?").get(userId);
  if (user?.is_superuser) return true;

  // Check direct user permission (object-level first, then type-level)
  const directCheck = db.prepare(`
    SELECT 1 FROM user_permissions up
    JOIN permissions p ON p.id = up.permission_id
    WHERE up.user_id = ?
      AND p.codename = ?
      AND p.object_type = ?
      AND (p.object_id = ? OR p.object_id IS NULL)
    LIMIT 1
  `).get(userId, codename, objectType, objectId);

  if (directCheck) return true;

  // Check group permissions
  const groupCheck = db.prepare(`
    SELECT 1 FROM user_groups ug
    JOIN group_permissions gp ON gp.group_id = ug.group_id
    JOIN permissions p ON p.id = gp.permission_id
    WHERE ug.user_id = ?
      AND p.codename = ?
      AND p.object_type = ?
      AND (p.object_id = ? OR p.object_id IS NULL)
    LIMIT 1
  `).get(userId, codename, objectType, objectId);

  return !!groupCheck;
}

// Middleware: require a specific permission or redirect
export function requirePermission(codename, objectType, getObjectId = null) {
  return (handler) => async (req, params, session) => {
    const objectId = getObjectId ? getObjectId(params) : null;
    if (!hasPermission(session.userId, codename, objectType, objectId)) {
      return new Response("Permission denied", { status: 403 });
    }
    return handler(req, params, session);
  };
}
```

### 6.3 Pre-seeded Permissions (on first install)

These are created at `initDB()` time for type-level access:

```javascript
const TYPE_LEVEL_PERMISSIONS = [
  { codename: "view_page",       name: "Can view all pages",       object_type: "page" },
  { codename: "edit_page",       name: "Can edit all pages",       object_type: "page" },
  { codename: "publish_page",    name: "Can publish all pages",    object_type: "page" },
  { codename: "delete_page",     name: "Can delete all pages",     object_type: "page" },
  { codename: "view_blogpost",   name: "Can view all blog posts",  object_type: "blogpost" },
  { codename: "edit_blogpost",   name: "Can edit all blog posts",  object_type: "blogpost" },
  { codename: "publish_blogpost",name: "Can publish blog posts",   object_type: "blogpost" },
  { codename: "delete_blogpost", name: "Can delete blog posts",    object_type: "blogpost" },
  { codename: "upload_media",    name: "Can upload media",         object_type: "media" },
  { codename: "delete_media",    name: "Can delete media",         object_type: "media" },
  { codename: "edit_settings",   name: "Can edit site settings",   object_type: "settings" },
  { codename: "manage_users",    name: "Can manage users/groups",  object_type: "user" },
];
```

### 6.4 Default Groups (seeded on install)

```
Group: Administrators
  → All type-level permissions

Group: Editors
  → view_page, edit_page
  → view_blogpost, edit_blogpost, publish_blogpost
  → upload_media

Group: Authors
  → edit_blogpost (own posts only — enforced in handler, not just permission)
  → upload_media
```

---

## 7. Page & Component Architecture

### 7.1 Page Rendering Flow

```
Request: GET /about

1. Check redirects table for /about → if found, 301/302
2. Find page WHERE slug='about' AND status='published'
3. If not found → 404
4. Load page_components WHERE page_id=X ORDER BY sort_order ASC
5. For each component:
   a. Fetch component record
   b. If type='static':
      - verifyAndRender(content, hmac_signature)
      - If HMAC invalid → log security alert, render empty placeholder
   c. If type='dynamic':
      - Parse tag string from content field
      - Execute tag handler (which queries DB and returns HTML)
6. Assemble: header + components[] + footer
7. Inject SEO <head> tags
8. Return response with security headers
```

### 7.2 Static Component

- HTML/CSS/JS stored as a sanitized string in `components.content`
- HMAC signature stored in `components.hmac_signature`
- `editable_regions` JSON defines what the content editor can touch
- Structure editor can modify the full HTML/CSS/JS
- Content editor can only modify text in `[data-editable]` elements and `<img>` src/alt

### 7.3 Dynamic Component

- `components.content` stores the tag string: `{% recentposts limit=5 %}`
- Rendered at request time by the template tag engine
- Editor can modify tag parameters (limit, category, layout)
- Editor CANNOT directly edit the data the tag pulls from DB
- Structure editor can change which tag is used and its params

---

## 8. Template Tag System

See the existing `src/core/tags.js` and `src/core/builtins.js`.

### Built-in tags (ship with core)

| Tag | Description |
|-----|-------------|
| `{% recentposts limit=5 category="slug" %}` | Latest published blog posts |
| `{% menu name="primary" %}` | Navigation from published pages |
| `{% breadcrumb %}` | Auto breadcrumb from page hierarchy |
| `{% searchform %}` | Search input form |
| `{% sitemap %}` | HTML sitemap |
| `{% categories %}` | Blog category list with counts |
| `{% siteinfo key="site_title" %}` | Any value from settings table |
| `{% cache seconds=3600 %}...{% endcache %}` | Cache a block |
| `{% if_plugin "name" %}...{% endif_plugin %}` | Conditional on plugin |
| `{% hero title="..." %}` | Hero section (theme tag) |
| `{% divider style="solid" %}` | Horizontal rule |

### Plugin tags

Plugins register tags via the `addTag` API in their `register()` function. Tags are registered before the first request is served.

### Theme tags

Drop a `.js` file in `themes/THEME_NAME/templatetags/`. It exports a `register({ addTag, addTemplateFilter })` function. Auto-loaded at startup.

---

## 9. Blog Module

Blog posts are separate from pages. They have their own URL structure, their own admin section, and rich SEO fields.

### URL structure

```
/blog/                        → Post listing (paginated)
/blog/[slug]                  → Single post
/blog/category/[slug]         → Category archive
/blog/tag/[slug]              → Tag archive
```

### Slug rules

- Auto-generated from title on creation: `"My Blog Post"` → `"my-blog-post"`
- User can override before publishing
- Once published, changing slug creates an automatic 301 redirect from old slug
- Canonical URL field can override the full URL completely

### SEO fields — required fields, not optional

Every blog post must have before publishing:
- `seo_title` (if empty, falls back to `title`)
- `meta_description` (hard limit: 160 characters)
- `featured_image` + `featured_image_alt`

Admin should warn (not block) if these are missing when publishing.

---

## 10. SEO & Sitemap

### 10.1 Meta Tags

**File:** `src/seo/meta.js`

For every page and blog post, inject into `<head>`:

```html
<!-- Basic -->
<title>{seo_title or title} — {site_title}</title>
<meta name="description" content="{meta_description}">
<link rel="canonical" href="{canonical_url or computed_url}">

<!-- Open Graph -->
<meta property="og:title" content="{og_title or seo_title or title}">
<meta property="og:description" content="{og_description or meta_description}">
<meta property="og:image" content="{og_image or featured_image}">
<meta property="og:type" content="article">
<meta property="og:url" content="{canonical_url}">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{meta_description}">
<meta name="twitter:image" content="{og_image}">

<!-- JSON-LD Schema -->
<script type="application/ld+json">{schema_json}</script>
```

### 10.2 JSON-LD Schema

**File:** `src/seo/schema.js`

For blog posts:

```json
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "Post Title",
  "description": "Meta description",
  "image": "https://example.com/featured.jpg",
  "author": { "@type": "Person", "name": "Author Name" },
  "publisher": {
    "@type": "Organization",
    "name": "Site Title",
    "logo": { "@type": "ImageObject", "url": "https://example.com/logo.png" }
  },
  "datePublished": "2026-04-01T00:00:00Z",
  "dateModified": "2026-04-01T00:00:00Z",
  "mainEntityOfPage": "https://example.com/blog/post-slug"
}
```

### 10.3 Sitemap

**File:** `src/seo/sitemap.js`

Served at `/sitemap.xml`. Cached in memory, regenerated when:
- A page is published or unpublished
- A blog post is published or unpublished
- Manually triggered from admin settings

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <lastmod>2026-04-01</lastmod>
    <priority>1.0</priority>
    <changefreq>weekly</changefreq>
  </url>
  <url>
    <loc>https://example.com/about</loc>
    <lastmod>2026-03-15</lastmod>
    <priority>0.8</priority>
    <changefreq>monthly</changefreq>
  </url>
  <url>
    <loc>https://example.com/blog/my-post</loc>
    <lastmod>2026-04-01</lastmod>
    <priority>0.6</priority>
    <changefreq>never</changefreq>
  </url>
</urlset>
```

Also serve `/robots.txt`:

```
User-agent: *
Allow: /
Disallow: /admin/
Sitemap: https://example.com/sitemap.xml
```

---

## 11. Admin Panel

### 11.1 Panel Sections

```
/admin/                       Dashboard (stats + recent activity)
/admin/pages/                 Page list
/admin/pages/new              Create page
/admin/pages/:id/edit         Edit page (structure)
/admin/pages/:id/content      Edit page (content editor)
/admin/pages/:id/seo          Edit page SEO fields
/admin/blog/                  Blog post list
/admin/blog/new               Create blog post
/admin/blog/:id/edit          Edit blog post
/admin/components/            Component library
/admin/components/new         Create component
/admin/media/                 Media library grid
/admin/users/                 User list (superuser only)
/admin/users/:id/edit         Edit user, assign groups
/admin/groups/                Group list
/admin/groups/:id/edit        Group + permissions editor
/admin/settings/              Site settings
/admin/settings/hosting       Domain + hosting config
/admin/settings/seo           Global SEO defaults
/admin/redirects/             URL redirect manager
/admin/plugins/               Plugin status
```

### 11.2 Hosting Settings Panel

`/admin/settings/hosting` exposes:

- **Site URL** — the canonical domain (used in sitemap, OG tags, etc.)
- **Force HTTPS** — toggle that adds HTTPS redirect in router
- **Custom domain instructions** — shows DNS records they need to set
- **Environment indicator** — clearly shows "DEVELOPMENT" or "PRODUCTION" in the panel header so there's no confusion

In development, show a banner: `⚠ Development mode — changes here affect localhost only`

---

## 12. Inline Editor

### 12.1 Two Modes

The editor is a client-side JS script loaded only for authenticated users who have edit permissions. It is never loaded for public visitors.

**Content Mode** — for Editors:
- Activated by a floating "Edit" button in the corner when logged in
- Clicking an `[data-editable="text"]` element makes it contenteditable
- A minimal toolbar appears: Bold, Italic, Link only
- Clicking an `[data-editable="image"]` opens the media picker
- Clicking an `[data-editable="alt"]` allows editing the alt attribute
- Save sends a PATCH request with CSRF token to `/admin/api/component/:id/content`
- Input is re-sanitized on the server before saving

**Structure Mode** — for Developers:
- Accessed from `/admin/components/:id/edit`
- Full HTML/CSS/JS code editor (use CodeMirror)
- Changes saved via POST with CSRF token
- Sanitized + re-signed before saving

### 12.2 Editable Region Markers

Static component HTML uses data attributes to mark editable regions:

```html
<section class="hero">
  <h1 data-editable="text" data-field="heading">Welcome to our site</h1>
  <p data-editable="text" data-field="subheading">We build great things</p>
  <img
    data-editable="image"
    data-field="hero_image"
    src="/uploads/hero.jpg"
    alt="Hero image"
    data-editable-alt="true"
  >
  <a href="/contact" data-editable="text" data-field="cta">Get in touch</a>
</section>
```

The `editable_regions` JSON in the components table stores which fields exist, used to validate that content mode edits only touch declared regions.

---

## 13. Build & Deployment

### Development

```bash
bun install
cp .env.development .env
bun dev          # Hot reload via --watch
```

### Production build (single binary)

```bash
NODE_ENV=production bun run build
# Output: ./veavecms  (single executable, ~15MB)

# Upload to server
scp veavecms user@server:/srv/cms/
scp .env.production user@server:/srv/cms/.env.production

# Run
NODE_ENV=production ./veavecms
```

### Systemd service

```ini
[Unit]
Description=Veave CMS
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/srv/cms
EnvironmentFile=/srv/cms/.env.production
Environment=NODE_ENV=production
ExecStart=/srv/cms/veavecms
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Nginx config

```nginx
server {
  listen 80;
  server_name example.com www.example.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name example.com;

  ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

  client_max_body_size 15M;   # Match your upload limit

  location / {
    proxy_pass         http://127.0.0.1:8080;
    proxy_set_header   Host $host;
    proxy_set_header   X-Real-IP $remote_addr;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
  }
}
```

---

## 14. What To Build — Ordered Checklist

Work in this exact order. Do not jump ahead. Each item depends on the previous.

### Sprint 1 — Foundation (Week 1–2)

- [ ] `src/config.js` — config loader (dev/prod)
- [ ] `config/development.js` — dev config
- [ ] `config/production.js` — prod config
- [ ] `.env.development` + `.env.production` templates
- [ ] `src/db.js` — complete schema (all tables from Section 4)
- [ ] `src/core/headers.js` — security headers (HSTS, CSP, X-Frame-Options)
- [ ] `src/core/csrf.js` — CSRF token generate + verify
- [ ] `src/core/ratelimit.js` — login rate limiter
- [ ] `src/core/sanitizer.js` — HTML sanitizer + HMAC sign/verify
- [ ] `src/core/auth.js` — sessions with CSRF token attached
- [ ] Update `src/index.js` to load config first, then init DB

### Sprint 2 — Permissions (Week 2–3)

- [ ] `src/core/permissions.js` — full permission engine
- [ ] Seed type-level permissions in `initDB()`
- [ ] Seed default groups (Admin, Editor, Author)
- [ ] `createObjectPermissions()` called in page create, component create, blog post create
- [ ] `deleteObjectPermissions()` called on delete
- [ ] `requirePermission()` middleware wrapping all admin handlers
- [ ] `/admin/users/` — user list, create, edit
- [ ] `/admin/groups/` — group list, create, assign permissions
- [ ] `/admin/users/:id/edit` — assign groups, direct permissions

### Sprint 3 — Pages & Components (Week 3–5)

- [ ] `src/admin/pages.js` — full CRUD with permission checks
- [ ] `src/admin/components.js` — full CRUD, sanitize+sign on save
- [ ] Page renderer — assemble components, verify HMAC before render
- [ ] Static component save → sanitize → sign → store
- [ ] Dynamic component save → validate tag syntax → store
- [ ] `src/admin/redirects.js` — redirect manager
- [ ] Old slug redirect on slug change
- [ ] Public router handles 301/302 redirects before page lookup

### Sprint 4 — Blog & SEO (Week 5–6)

- [ ] `src/admin/blog.js` — blog post CRUD
- [ ] Blog public routes: listing, single, category, tag
- [ ] `src/seo/meta.js` — meta tag builder
- [ ] `src/seo/schema.js` — JSON-LD generator
- [ ] `src/seo/sitemap.js` — sitemap.xml + robots.txt
- [ ] Sitemap regeneration on publish/unpublish
- [ ] SEO warning in admin when required fields are empty before publish

### Sprint 5 — Media & Editor (Week 6–8)

- [ ] `src/admin/media.js` — upload with magic byte validation
- [ ] Media library grid in admin
- [ ] `themes/default/assets/js/editor.js` — content mode inline editor
- [ ] CodeMirror integration for structure mode editor
- [ ] Editable region markers in default theme templates

### Sprint 6 — Polish (Week 8–10)

- [ ] Debug bar (dev mode only)
- [ ] Generic 500 page (prod) vs stack trace (dev)
- [ ] `/admin/settings/hosting` panel
- [ ] Environment indicator in admin header
- [ ] `src/core/update.js` — self-update mechanism
- [ ] Plugin system documentation (`docs/PLUGIN_API.md`)
- [ ] Install script (`install.sh`)
- [ ] Nginx config generator from admin panel

---

*Last updated: April 2026*
*Version: 0.1.0*
