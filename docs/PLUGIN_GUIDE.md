# MyCMS — Plugin Guide

> **Who this is for:** JavaScript developers who want to extend MyCMS without modifying core files.

---

## Table of contents

1. [How plugins work](#1-how-plugins-work)
2. [Plugin folder structure](#2-plugin-folder-structure)
3. [The register() function](#3-the-register-function)
4. [Adding template tags](#4-adding-template-tags)
5. [Adding template filters](#5-adding-template-filters)
6. [Action hooks](#6-action-hooks)
7. [Filter hooks](#7-filter-hooks)
8. [Accessing the database](#8-accessing-the-database)
9. [Security rules](#9-security-rules)
10. [Worked examples](#10-worked-examples)
11. [FAQ](#11-faq)

---

## 1. How plugins work

At startup, MyCMS scans the `plugins/` directory. Every subdirectory that contains an `index.js` is treated as a plugin. The file's `register()` export is called once with a set of helper functions that let the plugin add tags, filters, and hooks.

Plugins run in the same Node/Bun process as the server. There is no sandboxing — a plugin can crash the server or introduce security vulnerabilities, so only install plugins you trust.

Loading order within a startup call is alphabetical by folder name. If two plugins register the same tag name, the last one wins.

---

## 2. Plugin folder structure

The minimal plugin is a single file:

```
plugins/
  my-plugin/
    index.js        Required — must export register()
    package.json    Optional — for npm-published plugins
    README.md       Optional
```

`package.json` is not read by the plugin loader. It exists for npm distribution only. The plugin loader only looks for `index.js`.

---

## 3. The register() function

Every plugin must export a named function called `register`. It receives a single object with four helpers:

```javascript
// plugins/my-plugin/index.js

export function register({ addTag, addTemplateFilter, addAction, addFilter }) {
  // set up your plugin here
}
```

`register` can be `async`:

```javascript
export async function register({ addTag, addTemplateFilter, addAction, addFilter }) {
  const data = await fetch("https://api.example.com/config").then(r => r.json());
  addTag("my-tag", async () => `<p>${data.greeting}</p>`);
}
```

If `register` throws, the plugin is skipped and an error is printed to stdout. Other plugins continue loading normally.

| Helper | What it does |
|--------|-------------|
| `addTag(name, handler, opts?)` | Register a template tag usable in component content |
| `addTemplateFilter(name, fn)` | Add a Nunjucks filter usable in `.html` theme templates |
| `addAction(hook, fn)` | Subscribe to a lifecycle event (fire-and-forget) |
| `addFilter(hook, fn)` | Subscribe to a data filter (transform a value) |

---

## 4. Adding template tags

Tags appear in a component's `content` field as `{% tagname key=value %}`. The tag handler is called at render time (every page request) and returns an HTML string.

```javascript
addTag("tagname", async (attrs, ctx) => {
  // attrs — plain object parsed from the tag's attribute string
  // ctx   — current request context: { page, post, session, isAdmin }
  return "<p>Hello</p>";
});
```

### Attribute types

Attribute values are automatically cast: `limit=5` arrives as the number `5`, `name="primary"` as the string `"primary"`.

```javascript
// {% greeting name="Alice" repeat=3 %}
addTag("greeting", async ({ name = "World", repeat = 1 }) => {
  return Array(repeat).fill(`<p>Hello, ${escHtml(name)}!</p>`).join("");
});
```

### Block tags

Block tags wrap a body of content:

```javascript
// {% box color="blue" %}...content...{% endbox %}
addTag("box", async ({ color = "gray" }, body) => {
  return `<div class="box box-${escAttr(color)}">${body}</div>`;
}, { block: true });
```

The closing tag must be `{% end<tagname> %}` — so a tag registered as `"box"` closes with `{% endbox %}`.

> Block tags are not currently processed by `processTemplateTags()`, which only handles inline (non-block) tags. They work when used as a component's entire `content` field and rendered via `renderTag()` directly.

### Escaping output

Always escape user-controlled data. There are no built-in escape helpers exposed to plugins — copy these into your plugin or import an escaping library:

```javascript
function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escAttr(str) {
  return String(str ?? "").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
```

---

## 5. Adding template filters

Template filters extend Nunjucks and are available in all `.html` theme templates (not in component content tags).

```javascript
addTemplateFilter("currency", (value, symbol = "₹") => {
  return `${symbol}${Number(value).toLocaleString("en-IN")}`;
});
```

Usage in a theme template:

```nunjucks
{{ product.price | currency }}
{{ product.price | currency("$") }}
```

Filters are **synchronous** — Nunjucks does not support async filters. Do any async work in a tag instead, and cache the result if you need it in a filter context.

---

## 6. Action hooks

Action hooks let your plugin react to CMS events. All built-in hooks fire with `await`, so your handler can be async. Errors in action hooks are caught and logged — they do not abort the triggering operation.

```javascript
addAction("post.published", async ({ post }) => {
  console.log(`Post published: ${post.title}`);
});
```

### Available action hooks

| Hook | Payload | Fired when |
|------|---------|------------|
| `post.created` | `{ post }` | A new blog post is saved for the first time |
| `post.published` | `{ post }` | A post status changes to `"published"` |
| `post.deleted` | `{ postId }` | A post is deleted |
| `page.created` | `{ page }` | A new CMS page is created |
| `page.deleted` | `{ pageId }` | A page is deleted |
| `media.uploaded` | `{ file }` | A file upload completes (`file.filename`, `file.url`, `file.mimeType`) |
| `media.deleted` | `{ fileId, filename }` | A media file is deleted |
| `user.created` | `{ user }` | A new user account is created |

> **Note:** These hooks must be fired explicitly by the relevant admin handlers. If a handler does not call `fireAction(...)`, the hook will not fire. Check the admin module source to confirm a hook is wired before relying on it in production.

### Firing your own hooks

If you want your plugin to expose its own hooks to other plugins, import `fireAction` from core:

```javascript
// Inside a tag handler:
const { fireAction } = await import("../../src/core/plugins.js");
await fireAction("my-plugin.event", { data: "..." });
```

---

## 7. Filter hooks

Filter hooks transform a value by passing it through a chain of registered functions. The output of one function becomes the input of the next.

```javascript
// Transform every rendered blog post excerpt
addFilter("post.excerpt", async (excerpt, { post }) => {
  if (post.tags?.includes("sponsored")) {
    return `<span class="sponsored-label">Sponsored</span> ${excerpt}`;
  }
  return excerpt;
});
```

The second argument to `addFilter`'s handler receives additional context passed by the caller.

### Available filter hooks

| Hook | Initial value | Extra args | Used in |
|------|--------------|-----------|---------|
| `post.excerpt` | Excerpt string | `{ post }` | Blog listing |
| `post.content` | Full HTML content | `{ post }` | Post detail page |
| `component.html` | Rendered component HTML | `{ component }` | Page render |

> Like action hooks, filter hooks must be called with `applyFilter()` in the relevant handler to take effect.

---

## 8. Accessing the database

Plugins can query the database by importing `getDB` from the core. Use a **lazy dynamic import** inside your handler rather than a top-level import to avoid circular dependency issues:

```javascript
addTag("latest-products", async ({ limit = 3 }) => {
  const { getDB } = await import("../../src/db.js");
  const db = getDB();
  const products = db.prepare(
    "SELECT name, price, slug FROM products WHERE published = 1 ORDER BY created_at DESC LIMIT ?"
  ).all(limit);
  return products.map(p => `<div class="product"><a href="/p/${escAttr(p.slug)}">${escHtml(p.name)}</a></div>`).join("");
});
```

`getDB()` returns the shared `better-sqlite3` `Database` instance. All queries are **synchronous** — do not use `.then()` on them.

### Adding your own tables

If your plugin needs its own schema, run migrations inside `register()`:

```javascript
export async function register({ addTag }) {
  const { getDB } = await import("../../src/db.js");
  const db = getDB();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS plugin_views (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id INTEGER NOT NULL,
      views   INTEGER NOT NULL DEFAULT 0
    )
  `).run();

  addTag("view-count", async ({ pageId }) => {
    const row = db.prepare("SELECT views FROM plugin_views WHERE page_id = ?").get(pageId);
    return `<span class="views">${row?.views ?? 0} views</span>`;
  });
}
```

`CREATE TABLE IF NOT EXISTS` is safe to call every startup — it's a no-op when the table exists.

---

## 9. Security rules

Plugins run with full process privileges. Follow these rules to avoid introducing vulnerabilities.

| Rule | Reason |
|------|--------|
| **Always escape tag output** | Tags output raw HTML into pages. Unescaped data becomes XSS. |
| **Never use template literals to build SQL** | Use `.prepare(sql).all(param)` with bound parameters, never `"SELECT ... WHERE slug = '" + slug + "'"`. |
| **Validate and sanitize external data** | If your plugin fetches from an API or accepts user input, validate it before inserting or rendering. |
| **Keep secrets in environment variables** | Use `process.env.MY_PLUGIN_KEY`, not hard-coded strings. |
| **Fail gracefully** | Return an empty string from a tag on error rather than throwing — a thrown error becomes a blank component and logs to stdout. |
| **Don't store secrets in the DB** | The SQLite file is often world-readable on shared servers. |

---

## 10. Worked examples

### Example 1 — YouTube embed tag

```javascript
// plugins/youtube/index.js

export function register({ addTag }) {

  addTag("youtube", async ({ id = "", title = "Video" }) => {
    if (!id || !/^[\w-]{11}$/.test(id)) return "<!-- invalid youtube id -->";
    return `
      <div class="video-embed">
        <iframe
          src="https://www.youtube-nocookie.com/embed/${id}"
          title="${escAttr(title)}"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
          loading="lazy"
        ></iframe>
      </div>
    `;
  });
}

function escAttr(str) {
  return String(str ?? "").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
```

Usage in a component's content field:

```
{% youtube id="dQw4w9WgXcQ" title="My Video" %}
```

---

### Example 2 — Slack notification on post publish

```javascript
// plugins/slack-notify/index.js

const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

export function register({ addAction }) {

  addAction("post.published", async ({ post }) => {
    if (!WEBHOOK_URL) return;
    const siteUrl = process.env.SITE_URL || "http://localhost:8080";
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `📝 New post published: *${post.title}*\n${siteUrl}/blog/${post.slug}`,
      }),
    });
  });
}
```

Set the webhook URL before starting the server:

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/... bun dev
```

---

### Example 3 — Currency template filter

```javascript
// plugins/currency/index.js

export function register({ addTemplateFilter }) {

  addTemplateFilter("inr", (value) => {
    return "₹" + Number(value).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  });

  addTemplateFilter("usd", (value) => {
    return "$" + Number(value).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  });
}
```

In a theme template:

```nunjucks
{{ product.price_inr | inr }}
{{ product.price_usd | usd }}
```

---

### Example 4 — Recent posts with DB access and caching

```javascript
// plugins/featured-posts/index.js

let cache = null;
let cacheTime = 0;
const TTL_MS = 60_000; // 1 minute

export function register({ addTag }) {

  addTag("featured", async ({ limit = 3 }) => {
    const now = Date.now();
    if (!cache || now - cacheTime > TTL_MS) {
      const { getDB } = await import("../../src/db.js");
      const db = getDB();
      cache = db.prepare(`
        SELECT title, slug, excerpt, featured_image
        FROM blog_posts
        WHERE status = 'published'
        ORDER BY created_at DESC
        LIMIT 6
      `).all();
      cacheTime = now;
    }

    const posts = cache.slice(0, limit);
    return posts.map(p => `
      <article class="featured-post">
        ${p.featured_image ? `<img src="${escAttr(p.featured_image)}" alt="">` : ""}
        <h3><a href="/blog/${escAttr(p.slug)}">${escHtml(p.title)}</a></h3>
        ${p.excerpt ? `<p>${escHtml(p.excerpt)}</p>` : ""}
      </article>
    `).join("");
  });
}

function escHtml(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escAttr(str) {
  return String(str ?? "").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
```

---

## 11. FAQ

**Q: My tag is registered but outputs `<!-- unknown tag: my-tag -->`.**  
A: The tag name in the content field must exactly match the string passed to `addTag`. Check for typos and case — tag names are case-sensitive.

**Q: My `addTemplateFilter` call warns "registered before theme init".**  
A: This happens if `register()` runs before `initTheme()` completes. In practice this shouldn't occur because `loadPlugins()` is called after `initTheme()` in `index.js`. If you see this warning, check the startup order in your `src/index.js`.

**Q: Can I add admin UI pages from a plugin?**  
A: Not directly — there is no admin route injection API. You can add a custom route by importing `addTag` and using `addAction` to observe the request lifecycle, but a full admin page requires modifying `src/admin/router.js`.

**Q: Can a plugin modify the database schema?**  
A: Yes, by running `CREATE TABLE IF NOT EXISTS` inside `register()`. The shared `better-sqlite3` instance returned by `getDB()` accepts any SQL.

**Q: Can I use npm packages in my plugin?**  
A: Yes. Add a `package.json` to your plugin folder and run `bun install` in that folder. The module will be importable from your `index.js` normally. If shipping as a standalone folder (not via npm), bundle your dependencies into the plugin folder.

**Q: Will my plugin survive a server restart?**  
A: Yes. `register()` is called fresh on each startup. Any in-process caches (like the example above) are reset on restart, which is usually desirable.

**Q: How do I debug a plugin that's not loading?**  
A: Check startup logs. Errors in `register()` are caught and printed as `Plugin "name" failed to load: <message>`. A missing `index.js` or a missing `register` export is silently skipped — the plugin directory just isn't listed in the active plugins count.
