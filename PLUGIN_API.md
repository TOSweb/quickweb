# MyCMS — Plugin Developer Guide

Plugins live in the `/plugins` directory. Each plugin is a folder with an `index.js` file that exports a `register()` function.

---

## Basic Structure

```
plugins/
  my-plugin/
    index.js          Required — entry point
    README.md         Optional but recommended
    templates/        Optional — partial HTML templates
```

```javascript
// plugins/my-plugin/index.js

export async function register({ addTag, addTemplateFilter, addAction, addFilter }) {
  // Register your tags, filters, and hooks here
}
```

---

## Template Tags

### Simple tag — returns HTML string

```javascript
addTag("mywidget", async ({ title = "Default", limit = 5 }, ctx) => {
  // ctx is the current template context (has .post, .page, etc.)
  return `<div class="my-widget"><h3>${title}</h3></div>`;
});
```

Usage in theme:
```html
{% mywidget title="Latest News" limit=3 %}
```

### Block tag — wraps content

```javascript
addTag("wrapper", async ({ class: cls = "box" }, bodyContent) => {
  return `<div class="${cls}">${bodyContent}</div>`;
}, { block: true });
```

Usage:
```html
{% wrapper class="highlight-box" %}
  <p>This content is wrapped</p>
{% endwrapper %}
```

### Accessing the database

```javascript
addTag("featuredpost", async () => {
  const { getDB } = await import("../../src/db.js");
  const db = getDB();
  const post = db.prepare(
    "SELECT title, slug FROM blog_posts WHERE status='published' ORDER BY RANDOM() LIMIT 1"
  ).get();
  if (!post) return "";
  return `<a href="/blog/${post.slug}">${post.title}</a>`;
});
```

---

## Template Filters

```javascript
addTemplateFilter("currency", (value, symbol = "₹") => {
  return `${symbol}${Number(value).toLocaleString("en-IN")}`;
});
```

Usage:
```html
{{ product.price | currency }}
{{ product.price | currency("$") }}
```

---

## Action Hooks

Actions let your plugin respond to CMS events.

```javascript
// Runs after a blog post is saved
addAction("post.saved", async (post) => {
  console.log("Post saved:", post.title);
});

// Runs after a page is published
addAction("page.published", async (page) => {
  // e.g. ping search engines, send Slack notification
});

// Runs after a user logs in
addAction("user.login", async (user) => {
  console.log("User logged in:", user.username);
});
```

### Available action hooks

| Hook | Payload | When |
|------|---------|------|
| `post.saved` | blog post object | After any blog post save |
| `post.published` | blog post object | When status changes to published |
| `post.deleted` | post id | After deletion |
| `page.saved` | page object | After any page save |
| `page.published` | page object | When status changes to published |
| `user.login` | user object | After successful login |
| `component.saved` | component object | After component save |
| `media.uploaded` | media object | After file upload |

---

## Filter Hooks

Filters let you modify data before it's used.

```javascript
// Modify post content before rendering
addFilter("post.content", async (content, post) => {
  // e.g. replace custom shortcodes
  return content.replace(/\[youtube id="([^"]+)"\]/g, (_, id) =>
    `<iframe src="https://www.youtube.com/embed/${id}" allowfullscreen></iframe>`
  );
});
```

### Available filter hooks

| Hook | Value | When |
|------|-------|------|
| `post.content` | HTML string | Before rendering post content |
| `page.title` | string | Before rendering page title |
| `sitemap.urls` | URL array | Before generating sitemap XML |

---

## Plugin Example — YouTube Embed

```javascript
// plugins/youtube-embed/index.js

export async function register({ addFilter, addTag }) {

  // Convert [youtube id="xxx"] shortcodes in post content
  addFilter("post.content", async (content) => {
    return content.replace(
      /\[youtube\s+id="([a-zA-Z0-9_-]+)"\]/g,
      (_, id) => `
        <div class="youtube-embed">
          <iframe
            src="https://www.youtube.com/embed/${id}"
            frameborder="0"
            allow="accelerometer; autoplay; encrypted-media; gyroscope"
            allowfullscreen
            loading="lazy"
          ></iframe>
        </div>
      `
    );
  });

  // Also provide a template tag
  addTag("youtube", async ({ id, width = 560, height = 315 }) => {
    if (!id) return "<!-- youtube tag: id required -->";
    return `
      <div class="youtube-embed">
        <iframe
          width="${width}"
          height="${height}"
          src="https://www.youtube.com/embed/${id}"
          frameborder="0"
          allowfullscreen
          loading="lazy"
        ></iframe>
      </div>
    `;
  });

}
```

---

## Rules for Plugin Authors

1. **Never use raw string interpolation in SQL queries.** Always use prepared statements.
2. **Never output user-provided data without escaping** — use template literals carefully, escape HTML entities.
3. **Import `getDB` lazily** inside tag handlers, not at module top level.
4. **Don't block the event loop** — use `async/await`, never `readFileSync` in request handlers.
5. **Fail gracefully** — tag handlers should return empty string on error, not throw.
6. **Namespace your CSS classes** — prefix with your plugin name to avoid conflicts.
