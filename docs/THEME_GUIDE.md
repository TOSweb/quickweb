# MyCMS — Theme Guide

> **Who this is for:** frontend developers who want to customise the look of a MyCMS site or build a theme from scratch.

---

## Table of contents

1. [Theme structure](#1-theme-structure)
2. [Template files](#2-template-files)
3. [Template variables](#3-template-variables)
4. [Nunjucks globals and filters](#4-nunjucks-globals-and-filters)
5. [Components in themes](#5-components-in-themes)
6. [Editable regions](#6-editable-regions)
7. [Theme-specific template tags](#7-theme-specific-template-tags)
8. [Switching themes](#8-switching-themes)
9. [Creating a theme from scratch](#9-creating-a-theme-from-scratch)

---

## 1. Theme structure

```
themes/
  your-theme/
    index.html          Blog listing / homepage (required)
    page.html           CMS pages (required)
    post.html           Single blog post (required)
    post-list.html      Blog listing with category/tag header (optional, falls back to index.html)
    theme.json          Theme metadata
    assets/
      css/
        style.css       Main stylesheet (served at /assets/css/style.css)
      js/
        editor.js       Inline editor client script
    components/
      hero/
        template.njk    Nunjucks template for the "hero" component type
      navigation/
        template.njk
      my-widget.html    Simple single-file component (alternative to folder/template.njk)
    templatetags/
      my-tags.js        Theme-specific tag registration
```

### theme.json

```json
{
  "name": "My Theme",
  "version": "1.0.0",
  "author": "Your Name",
  "description": "A clean, minimal theme"
}
```

---

## 2. Template files

All templates use [Nunjucks](https://mozilla.github.io/nunjucks/) syntax.

### index.html — Blog listing / homepage

Receives:

| Variable | Type | Content |
|----------|------|---------|
| `posts` | array | Published blog posts (paginated) |
| `page` | integer | Current page number |
| `total_pages` | integer | Total page count |
| `category` | object\|null | Set when viewing a category archive |
| `tag` | object\|null | Set when viewing a tag archive |
| `isAdmin` | bool | Whether a logged-in admin is viewing |
| `session` | object\|null | Current session (`session.username`, etc.) |

```html
{% for post in posts %}
  <article>
    <h2><a href="/blog/{{ post.slug }}">{{ post.title }}</a></h2>
    <time>{{ post.created_at | date }}</time>
    <p>{{ post.excerpt }}</p>
  </article>
{% endfor %}

{% if total_pages > 1 %}
  {% if page > 1 %}<a href="/blog?page={{ page - 1 }}">← Prev</a>{% endif %}
  <span>{{ page }} / {{ total_pages }}</span>
  {% if page < total_pages %}<a href="/blog?page={{ page + 1 }}">Next →</a>{% endif %}
{% endif %}
```

### page.html — CMS page

Receives:

| Variable | Type | Content |
|----------|------|---------|
| `page` | object | The page row from the database |
| `components_html` | string | Pre-rendered component HTML — output with `\| safe` |
| `seo_head` | string | `<meta>` and JSON-LD tags — output with `\| safe` in `<head>` |
| `isAdmin` | bool | |
| `isEditing` | bool | Whether `?edit=1` is set |
| `session` | object\|null | |

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>{{ page.title }} — {{ site_title() }}</title>
  {{ seo_head | safe }}
  <link rel="stylesheet" href="/assets/css/style.css">
</head>
<body>
  {{ components_html | safe }}
</body>
</html>
```

> **Important:** `components_html` is already rendered and safe — it has passed HMAC verification and HTML sanitization. Always output it with `| safe`.

### post.html — Single blog post

Receives:

| Variable | Type | Content |
|----------|------|---------|
| `post` | object | Full blog post row |
| `seo_head` | string | Meta + JSON-LD |
| `isAdmin` | bool | |
| `session` | object\|null | |

```html
<article>
  <h1>{{ post.title }}</h1>
  <time>{{ post.created_at | date }}</time>
  {% if post.featured_image %}
    <img src="{{ post.featured_image }}" alt="{{ post.featured_image_alt }}">
  {% endif %}
  <div class="content">{{ post.content | safe }}</div>
</article>
```

> Post content is sanitized by an allowlist on save, so `| safe` is correct here.

---

## 3. Template variables

### Page object

```
page.id
page.title
page.slug              — URL segment
page.canonical_url     — Override full canonical URL
page.status            — "draft" | "published"
page.template          — Which template to use
page.seo_title
page.meta_description
page.created_at
page.updated_at
```

### Blog post object

```
post.id
post.title
post.slug
post.content           — Sanitized HTML
post.excerpt
post.featured_image    — URL
post.featured_image_alt
post.seo_title
post.meta_description
post.og_title
post.og_description
post.og_image
post.schema_type       — "BlogPosting" | "Article" | "NewsArticle"
post.status
post.author_id
post.created_at
post.updated_at
```

---

## 4. Nunjucks globals and filters

These are available in every template.

### Globals (called as functions)

```nunjucks
{{ site_title() }}        — value of settings.site_title
{{ site_tagline() }}      — value of settings.site_tagline
{{ site_url() }}          — value of settings.site_url
{{ year() }}              — current year (for copyright lines)
{{ csrf_token(session.id) }} — CSRF token for forms
```

### Filters

```nunjucks
{{ post.created_at | date }}         — "1 January 2026" (locale: en-IN)
{{ post.content | json_parse }}      — parse JSON string to object
{{ some_html | safe }}               — output raw HTML (use only for trusted, sanitized content)
{{ long_text | truncate(200) }}      — Nunjucks built-in truncation
```

### Adding your own filter

In a plugin (`addTemplateFilter`) or in `theme.js` inside `initTheme()`:

```javascript
// In a plugin:
addTemplateFilter("currency", (value, symbol = "₹") => {
  return `${symbol}${Number(value).toLocaleString("en-IN")}`;
});

// Usage in template:
{{ product.price | currency }}
{{ product.price | currency("$") }}
```

---

## 5. Components in themes

Each component type has a template file in `themes/your-theme/components/`.

### Folder-based component (recommended)

```
components/
  hero/
    template.njk
```

```nunjucks
{# components/hero/template.njk #}
<section class="hero">
  <h1 data-editable="text" data-field="title">{{ title }}</h1>
  <p data-editable="text" data-field="subtitle">{{ subtitle }}</p>
  <a href="{{ button_url }}" data-editable="text" data-field="button_text">{{ button_text }}</a>
</section>
```

The `title`, `subtitle`, `button_url`, `button_text` variables come from the component's `content` JSON field in the database.

### Single-file component

```
components/
  divider.html
```

```html
<!-- components/divider.html -->
<hr class="divider">
```

### Dynamic component (tag-based)

Dynamic components don't have a template. Their `content` field holds a tag string:

```
{% recentposts limit=5 %}
```

The tag engine renders it at request time. Set the component's type to `dynamic` when creating it.

---

## 6. Editable regions

Add `data-editable` attributes to mark elements as editable in the inline editor.

```html
<!-- Text element — becomes contentEditable when editor is active -->
<h1 data-editable="text" data-field="heading">{{ heading }}</h1>

<!-- Image — clicking opens URL prompt -->
<img
  data-editable="image"
  data-field="hero_image"
  src="{{ hero_image }}"
  alt="{{ hero_image_alt }}"
>
```

| Attribute | Value | Effect |
|-----------|-------|--------|
| `data-editable` | `"text"` | Inline text editing with contentEditable |
| `data-editable` | `"image"` | Prompt to change `src` URL |
| `data-field` | field name | Key used to save the value in the component's content JSON |

The field names must match the keys in the component's `content` JSON object. When the admin saves, the field values are updated in the database under those keys.

---

## 7. Theme-specific template tags

You can register tags that are only available in your theme. Create a `.js` file in `themes/your-theme/templatetags/`:

```javascript
// themes/your-theme/templatetags/social.js

export function register({ addTag, addTemplateFilter }) {

  addTag("twitter_follow", async ({ handle = "" }) => {
    if (!handle) return "";
    return `<a href="https://twitter.com/${handle}" class="social-link">Follow @${handle}</a>`;
  });

  addTemplateFilter("initials", (name) => {
    return name.split(" ").map(w => w[0]).join("").toUpperCase();
  });
}
```

Theme tags are loaded automatically at startup alongside built-in tags.

> **Note:** Theme-specific tag loading is not yet auto-wired in `index.js`. Add the import and call to `registerBuiltins()` in `src/core/builtins.js` or create a separate loader.

---

## 8. Switching themes

1. Create your theme folder under `themes/`.
2. Go to **Admin → Settings → General → Active Theme** (if this setting is exposed in your settings UI, otherwise update the database directly):

```bash
bun -e "
import { initDB, getDB } from './src/db.js';
await initDB();
getDB().prepare(\"UPDATE settings SET value=? WHERE key='active_theme'\").run('my-theme');
console.log('Theme switched.');
"
```

3. Restart the server (or wait for hot reload in dev mode).

The theme engine re-reads the active theme from the database each time `initTheme()` is called (on startup).

---

## 9. Creating a theme from scratch

Here is the minimal set of files needed:

### `themes/minimal/theme.json`

```json
{ "name": "Minimal", "version": "1.0.0" }
```

### `themes/minimal/index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{{ site_title() }}</title>
</head>
<body>
  <main>
    {% for post in posts %}
      <article>
        <h2><a href="/blog/{{ post.slug }}">{{ post.title }}</a></h2>
        <p>{{ post.excerpt or "" }}</p>
      </article>
    {% endfor %}
  </main>
</body>
</html>
```

### `themes/minimal/page.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{{ page.title }} — {{ site_title() }}</title>
  {{ seo_head | safe }}
</head>
<body>
  {{ components_html | safe }}
</body>
</html>
```

### `themes/minimal/post.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{{ post.title }} — {{ site_title() }}</title>
  {{ seo_head | safe }}
</head>
<body>
  <article>
    <h1>{{ post.title }}</h1>
    <div>{{ post.content | safe }}</div>
  </article>
</body>
</html>
```

That's it — a working three-template theme. Add CSS, components, and more templates as needed.
