# MyCMS — Developer Guide

> **Who this is for:** JavaScript developers who want to understand the codebase, extend the admin, add features, or integrate MyCMS with other systems.

---

## Table of contents

1. [Architecture overview](#1-architecture-overview)
2. [Project structure](#2-project-structure)
3. [Request lifecycle](#3-request-lifecycle)
4. [Environment & configuration](#4-environment--configuration)
5. [Database](#5-database)
6. [Security layer](#6-security-layer)
7. [Permission system](#7-permission-system)
8. [Template tag system](#8-template-tag-system)
9. [Hook system (actions & filters)](#9-hook-system-actions--filters)
10. [Adding an admin module](#10-adding-an-admin-module)
11. [Resetting the admin password](#11-resetting-the-admin-password)
12. [Running in production mode locally](#12-running-in-production-mode-locally)
13. [Common patterns & conventions](#13-common-patterns--conventions)
14. [FAQ](#14-faq)

---

## 1. Architecture overview

```
Browser
   │
   ▼
Bun.serve()  ──── securityHeaders() ──── router()
                                            │
                              ┌─────────────┼──────────────────┐
                              ▼             ▼                  ▼
                         /admin/*       /blog/*           /page-slug
                       adminRouter()   public router     public router
                              │
                  ┌───────────┼───────────┐
                  ▼           ▼           ▼
             requireAuth  csrfProtect   handler
                  │
                  ▼
               handler(req, params, session)
                  │
                  ▼
            DB query (better-sqlite3, sync)
                  │
                  ▼
            adminHTML() / htmlResponse()
```

**Key design choices:**

- **No framework.** Routes are plain `if/match` chains in `router.js` and `admin/router.js`. Simple to trace, no magic.
- **Sync DB everywhere.** `better-sqlite3` is synchronous, so all DB calls are plain function calls. No `await` needed for queries.
- **Async only at the edges.** File I/O, template rendering (when dynamic components run), and plugin loading are async. The rest is sync.
- **Security is middleware.** CSRF, rate limiting, and auth are composable wrapper functions that return a new handler.

---

## 2. Project structure

```
src/
├── index.js            Startup: initDB → initTheme → registerBuiltins → loadPlugins → Bun.serve
├── router.js           Public router: static files, sitemap, admin delegation, blog, pages
├── db.js               SQLite init, all CREATE TABLE, permission+group seeding, getSetting()
├── config.js           Loads config/{NODE_ENV}.js, re-exports as default
│
├── admin/
│   ├── router.js       Dispatches all /admin/* paths — plain if/regex chain
│   ├── base.js         adminHTML(title, content, session) — shared admin shell + sidebar
│   ├── auth.js         /admin/login, /admin/setup, /admin/logout
│   ├── blog.js         Post CRUD + categories; calls invalidateSitemap() on publish
│   ├── components.js   Component CRUD + content update API
│   ├── dashboard.js    Stats + update check
│   ├── developer.js    Component template file editor
│   ├── media.js        Upload (magic bytes) + library + delete
│   ├── pages.js        Page CRUD + component assignment
│   ├── redirects.js    Redirect CRUD
│   ├── settings.js     General / SEO / Hosting settings forms
│   └── users.js        User CRUD + group CRUD + permission assignment
│
├── core/
│   ├── auth.js         hashPassword, verifyPassword, login(), getSession(), requireAuth()
│   ├── builtins.js     registerBuiltins() — registers 11 built-in template tags
│   ├── csrf.js         generateCsrfToken(), verifyCsrfToken(), csrfProtect() middleware
│   ├── headers.js      securityHeaders() — wraps every response with security headers
│   ├── permissions.js  hasPermission(), requirePermission(), createObjectPermissions()
│   ├── plugins.js      loadPlugins(), fireAction(), applyFilter(), setFilterAdder()
│   ├── ratelimit.js    checkRateLimit(), recordLoginSuccess() — in-memory per-IP
│   ├── sanitizer.js    sanitizeHtml(), signContent(), verifyContent(), verifyAndRender()
│   ├── tags.js         registerTag(), getTag(), parseTagAttrs(), processTemplateTags()
│   ├── theme.js        initTheme(), renderComponents(), render(), htmlResponse()
│   └── update.js       getCurrentVersion(), checkForUpdate()
│
└── seo/
    ├── meta.js         buildMeta({ page|post }) → HTML string of meta tags
    ├── schema.js       buildSchema({ page|post }) → JSON-LD <script> tag
    └── sitemap.js      serveSitemap(), serveRobots(), invalidateSitemap()
```

---

## 3. Request lifecycle

### Public page request (`GET /about`)

```
router.js
 1. Parse URL, get session from cookie
 2. Check /assets/, /uploads/, /sitemap.xml, /robots.txt  → serve & return
 3. Check /admin → delegate to adminRouter
 4. Look up redirects table for /about → if found, 301/302
 5. Match /blog/:slug routes → serve blog post
 6. Look up pages WHERE slug = 'about' AND status = 'published'
 7. await renderComponents(page.id, { isAdmin, isEditing, session })
    └── for each component:
        ├── verifyAndRender(content, hmac_signature)  ← HMAC check
        ├── if dynamic: processTemplateTags(content, ctx)  ← tag engine
        └── if static: env.render(template.njk, contentData)
 8. buildMeta({ page }) + buildSchema({ page }) → seo_head string
 9. htmlResponse("page", { page, components_html, seo_head, ... })
10. securityHeaders(response, config)  ← wraps every response
```

### Admin POST request (`POST /admin/blog/new`)

```
router.js
 1. req.method === "POST" → await req.formData() → req._form
 2. Delegate to adminRouter(req, "/admin/blog/new")

admin/router.js
 3. Match path → handleNewPost(req, {})

admin/blog.js — handleNewPost
 4. requireAuth wrapper: check session cookie → get session from DB
 5. csrfProtect wrapper: req._form.get("_csrf") → verifyCsrfToken(token, session.id)
 6. Read and validate form fields
 7. sanitizeHtml(content)  ← strip dangerous HTML
 8. db.prepare("INSERT INTO blog_posts ...").run(...)
 9. createObjectPermissions("blogpost", postId)
10. invalidateSitemap()
11. Response.redirect("/admin/blog", 302)
```

---

## 4. Environment & configuration

Configuration is split into two files loaded by `src/config.js`:

```
config/development.js   ← NODE_ENV=development (default)
config/production.js    ← NODE_ENV=production
```

Secrets come from `.env` files (never committed):

```bash
# .env.development
NODE_ENV=development
SESSION_SECRET=dev-session-secret-not-for-production
HMAC_SECRET=dev-hmac-secret-not-for-production
CSRF_SECRET=dev-csrf-secret-not-for-production
```

```bash
# .env.production
NODE_ENV=production
PORT=8080
DOMAIN=example.com
SITE_URL=https://example.com
DB_PATH=./data/cms.db
UPLOAD_PATH=./data/uploads
SESSION_SECRET=<openssl rand -hex 64>
HMAC_SECRET=<openssl rand -hex 64>
CSRF_SECRET=<openssl rand -hex 64>
```

### Reading config in your code

```javascript
import config from "../config.js";

config.env           // "development" | "production"
config.port          // 8080
config.siteUrl       // "https://example.com"
config.security.hmacSecret
config.uploads.maxSizeMb
config.rateLimit.loginMaxAttempts
config.debug.showStackTraces
```

---

## 5. Database

MyCMS uses **better-sqlite3** (synchronous SQLite). All queries use prepared statements — never template literals.

### Getting the DB handle

```javascript
import { getDB } from "../db.js";

const db = getDB();  // throws if initDB() hasn't run yet
```

### Query patterns

```javascript
// Single row — returns object or undefined
const page = db.prepare("SELECT * FROM pages WHERE slug = ?").get(slug);

// Multiple rows — returns array
const posts = db.prepare("SELECT * FROM blog_posts WHERE status = ? LIMIT ?").all("published", 10);

// Insert/update/delete — returns { lastInsertRowid, changes }
const result = db.prepare("INSERT INTO pages (title, slug) VALUES (?, ?)").run(title, slug);
const newId = result.lastInsertRowid;

// Read a setting
import { getSetting } from "../db.js";
const siteTitle = getSetting("site_title");
```

### Schema reference

See [BUILD_SPEC.md Section 4](../BUILD_SPEC.md#4-database-schema) for the full CREATE TABLE definitions. Key tables:

| Table | Purpose |
|-------|---------|
| `users` | Accounts. `is_superuser=1` bypasses all permission checks |
| `groups` | Named permission sets |
| `permissions` | One row per action per object. `object_id IS NULL` = type-level |
| `group_permissions` | Many-to-many: groups ↔ permissions |
| `user_permissions` | Direct per-user permissions |
| `pages` | CMS pages |
| `components` | Content blocks — static (HTML) or dynamic (tag string) |
| `page_components` | Which components are on which page, ordered by `sort_order` |
| `blog_posts` | Blog posts with full SEO fields |
| `blog_categories` / `blog_tags` | Taxonomy |
| `redirects` | Old URL → new URL mappings |
| `media` | Uploaded file metadata |
| `settings` | Key-value site config |
| `sessions` | DB-persisted sessions (cleared on expiry) |

### Adding a new table

Add it to `src/db.js` inside `initDB()` using `CREATE TABLE IF NOT EXISTS`. It will be created on next startup. No migration system — `IF NOT EXISTS` is idempotent.

---

## 6. Security layer

### CSRF protection

Every state-changing admin route must be wrapped in `csrfProtect()`:

```javascript
import { csrfProtect } from "../core/csrf.js";
import { requireAuth } from "../core/auth.js";

export const handleSomething = requireAuth(csrfProtect(async (req, params, session) => {
  const form = req._form;  // pre-parsed by router.js for POST requests
  // ...
}));
```

Every admin form must include the CSRF token:

```html
<form method="POST" action="/admin/something">
  <input type="hidden" name="_csrf" value="${generateCsrfToken(session.id)}">
  <!-- fields -->
</form>
```

The token is an HMAC-SHA256 of the session ID, keyed by `CSRF_SECRET`. Comparison uses constant-time XOR to prevent timing attacks.

### HTML sanitization

Before saving any component HTML, always sanitize and sign:

```javascript
import { sanitizeAndSign } from "../core/sanitizer.js";

const { content, hmac_signature } = sanitizeAndSign(rawHtml);
db.prepare("UPDATE components SET content=?, hmac_signature=? WHERE id=?")
  .run(content, hmac_signature, id);
```

Before rendering, always verify:

```javascript
import { verifyAndRender } from "../core/sanitizer.js";

const html = verifyAndRender(comp.content, comp.hmac_signature);
// Returns the HTML if valid, a placeholder comment if HMAC invalid
```

### Security headers

Every response is automatically wrapped in `securityHeaders()` by `index.js`. Headers set:

- `X-Frame-Options: DENY`
- `Content-Security-Policy` with `frame-ancestors 'none'`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Strict-Transport-Security` (production only)

---

## 7. Permission system

### Checking a permission in a handler

```javascript
import { hasPermission } from "../core/permissions.js";

// Type-level: can this user edit any page?
const canEdit = hasPermission(session.userId, "edit_page", "page");

// Object-level: can this user edit page #5?
const canEditSpecific = hasPermission(session.userId, "edit_page", "page", 5);
```

### Protecting a route with middleware

```javascript
import { requirePermission } from "../core/permissions.js";

export const editPage = requireAuth(
  requirePermission("edit_page", "page", params => parseInt(params.id))(
    csrfProtect(async (req, params, session) => {
      // Only reached if user has edit_page on this specific page
    })
  )
);
```

### Creating permissions for new objects

Call this inside the transaction that creates the object. It inserts one permission row per action:

```javascript
import { createObjectPermissions } from "../core/permissions.js";

const result = db.prepare("INSERT INTO my_objects ...").run(...);
createObjectPermissions("page", result.lastInsertRowid);
```

For a `page`, this creates: `view_page`, `edit_page`, `publish_page`, `delete_page` — all scoped to that specific page ID.

### Cleaning up on delete

```javascript
import { deleteObjectPermissions } from "../core/permissions.js";

db.prepare("DELETE FROM pages WHERE id = ?").run(id);
deleteObjectPermissions("page", id);
```

### Permission codename convention

```
{action}_{objecttype}

view_page, edit_page, publish_page, delete_page
edit_content_component, edit_structure_component
view_blogpost, edit_blogpost, publish_blogpost, delete_blogpost
upload_media, delete_media
edit_settings
manage_users
```

---

## 8. Template tag system

Tags are functions registered by name that can be called from component content fields or theme templates.

### Registering a tag

```javascript
import { registerTag } from "../core/tags.js";

// Simple tag — returns HTML string
registerTag("greeting", async ({ name = "World" }, ctx) => {
  return `<p>Hello, ${name}!</p>`;
});

// Block tag — receives inner content
registerTag("highlight", async ({ color = "yellow" }, bodyContent, ctx) => {
  return `<div style="background:${color}">${bodyContent}</div>`;
}, { block: true });
```

### Using tags in dynamic components

Set a component's type to `dynamic` and its content to a tag call:

```
{% recentposts limit=3 category="news" %}
```

### Tag attribute parsing

Attributes support: unquoted strings, single-quoted, double-quoted, integers, floats:

```
{% mytag title="Hello World" limit=5 active=true class='my-class' %}
```

Parsed into: `{ title: "Hello World", limit: 5, active: "true", class: "my-class" }`

### Built-in tags

| Tag | Parameters | Output |
|-----|-----------|--------|
| `{% recentposts %}` | `limit=5 category="slug"` | Latest posts list |
| `{% menu %}` | `name="primary"` | Nav from published pages |
| `{% categories %}` | — | Category list with post counts |
| `{% siteinfo %}` | `key="site_title"` | Any value from settings table |
| `{% searchform %}` | — | Search `<form>` |
| `{% sitemap %}` | — | HTML sitemap |
| `{% hero %}` | `title subtitle cta cta_url` | Hero section HTML |
| `{% breadcrumb %}` | — | Breadcrumb nav (uses ctx.page or ctx.post) |
| `{% divider %}` | `style="solid"` | `<hr>` element |
| `{% cache %}` | `seconds=3600` | Cache block (no-op in v1, renders body) |
| `{% if_plugin %}` | `"plugin-name"` | Conditional on plugin presence |

---

## 9. Hook system (actions & filters)

### Firing an action from CMS code

Call this wherever an event happens. All registered plugin handlers run:

```javascript
import { fireAction } from "../core/plugins.js";

// After a post is saved
await fireAction("post.saved", post);

// After a post is published
await fireAction("post.published", post);
```

### Applying a filter from CMS code

Filters chain — each registered handler receives the output of the previous:

```javascript
import { applyFilter } from "../core/plugins.js";

// Filter post content before rendering
const filteredContent = await applyFilter("post.content", post.content, post);
```

### Available hooks

**Actions** (fire-and-forget, no return value used):

| Hook | Payload | When |
|------|---------|------|
| `post.saved` | post object | After any blog post save |
| `post.published` | post object | Status changes to published |
| `post.deleted` | post id | After deletion |
| `page.saved` | page object | After any page save |
| `page.published` | page object | Status changes to published |
| `user.login` | user object | After successful login |
| `component.saved` | component object | After component save |
| `media.uploaded` | media object | After file upload |

**Filters** (return modified value):

| Hook | Value | When |
|------|-------|------|
| `post.content` | HTML string | Before rendering post content |
| `page.title` | string | Before rendering page title |
| `sitemap.urls` | URL array | Before generating sitemap XML |

> These hooks are defined but most are not yet wired to `fireAction`/`applyFilter` calls in the CMS core. Wire them yourself in the relevant admin handlers, or use a plugin that hooks `post.saved` etc.

---

## 10. Adding an admin module

Follow this pattern to add a new section to the admin.

### 1. Create the handler file

```javascript
// src/admin/mymodule.js
import { getDB } from "../db.js";
import { adminHTML } from "./base.js";
import { requireAuth } from "../core/auth.js";
import { csrfProtect, generateCsrfToken } from "../core/csrf.js";

export const listPage = requireAuth(async (req, params, session) => {
  const db = getDB();
  const rows = db.prepare("SELECT * FROM my_table ORDER BY created_at DESC").all();
  const csrfToken = generateCsrfToken(session.id);
  const body = `<h2>My Module</h2><!-- render rows -->`;
  return new Response(adminHTML("My Module", body, session), {
    headers: { "Content-Type": "text/html" },
  });
});

export const handleCreate = requireAuth(csrfProtect(async (req, params, session) => {
  const form = req._form;
  getDB().prepare("INSERT INTO my_table (name) VALUES (?)").run(form.get("name"));
  return Response.redirect("/admin/mymodule", 302);
}));
```

### 2. Register routes in admin/router.js

```javascript
import { listPage, handleCreate } from "./mymodule.js";

// Inside adminRouter():
if (path === "/admin/mymodule") return listPage(req, {});
if (path === "/admin/mymodule/new" && method === "POST") return handleCreate(req, {});
```

### 3. Add to the sidebar in admin/base.js

```javascript
<a href="/admin/mymodule" class="${title === 'My Module' ? 'active' : ''}">📦 My Module</a>
```

---

## 11. Resetting the admin password

If you're locked out, run this one-liner from the project root:

```bash
bun -e "
import { initDB, getDB } from './src/db.js';
import { hashPassword } from './src/core/auth.js';
await initDB();
const hash = await hashPassword('new-password-here');
getDB().prepare(\"UPDATE users SET password_hash=? WHERE username=?\").run(hash, 'admin');
console.log('Password reset.');
"
```

---

## 12. Running in production mode locally

```bash
# Generate secrets
export SESSION_SECRET=$(openssl rand -hex 64)
export HMAC_SECRET=$(openssl rand -hex 64)
export CSRF_SECRET=$(openssl rand -hex 64)
export NODE_ENV=production

bun run src/index.js
```

Or use the compiled binary:

```bash
NODE_ENV=production bun run build
NODE_ENV=production ./mycms
```

---

## 13. Common patterns & conventions

### Route handler signature

```javascript
// Wrapped handler — receives req, params, session
async (req, params, session) => {
  // req._form   — FormData (set by router.js for POST)
  // req._body   — JSON body (set by router.js for JSON POST)
  // params.id   — URL params (from regex match in router)
  // session.userId, session.username, session.isSuperuser
}
```

### Standard response patterns

```javascript
// HTML page
return new Response(adminHTML("Title", body, session), {
  headers: { "Content-Type": "text/html" },
});

// Redirect after POST
return Response.redirect("/admin/somewhere", 302);

// JSON API response
return new Response(JSON.stringify({ success: true }), {
  headers: { "Content-Type": "application/json" },
});

// Error
return new Response("Not found", { status: 404 });
```

### HTML escaping in admin templates

All admin modules use a local `esc()` helper. Always escape user-sourced values before putting them in HTML:

```javascript
function esc(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Usage
const body = `<td>${esc(user.username)}</td>`;
```

### SQL: always prepared statements

```javascript
// ✅ correct
const post = db.prepare("SELECT * FROM blog_posts WHERE slug = ?").get(slug);

// ❌ never
const post = db.prepare(`SELECT * FROM blog_posts WHERE slug = '${slug}'`).get();
```

---

## 14. FAQ

**Q: Where should I put initialization code that only runs once?**  
A: Inside `initDB()` in `src/db.js`. It runs before the server starts accepting requests.

**Q: How do I add a Nunjucks filter for use in themes?**  
A: Either add it in `theme.js` inside `initTheme()`, or from a plugin using `addTemplateFilter()`.

**Q: How do I read a setting from outside the admin?**  
A: `import { getSetting } from "../db.js"; getSetting("site_title");`

**Q: Why is there no ORM?**  
A: better-sqlite3 with prepared statements is already safe, fast, and type-correct enough for a single-server CMS. An ORM adds abstraction without benefit at this scale.

**Q: Can I use this with Node.js instead of Bun?**  
A: Yes, but `bun:sqlite` is replaced with better-sqlite3 in the `db.js`. The project already imports from `better-sqlite3` for that reason. The `Bun.password` calls in `auth.js` and `Bun.write` in `media.js` have Node.js fallback paths.

**Q: What's the session storage?**  
A: Sessions are stored in the `sessions` SQLite table with an `expires_at` timestamp. They survive server restarts. Expired sessions are cleaned up lazily on access.

**Q: Why does the component have an HMAC signature?**  
A: To detect database tampering. If someone gains direct SQLite access and modifies a component's HTML, the signature check at render time will catch it and refuse to render the component. This is defence-in-depth — it doesn't replace access controls, but it prevents a compromised DB from delivering XSS payloads silently.
