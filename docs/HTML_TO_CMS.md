# Converting HTML/CSS/JS to BunCMS

This guide shows how to take any static HTML design and turn it into a fully editable CMS page or component — including inline editing, dynamic content, and SEO support.

---

## Table of contents

1. [How the CMS renders pages](#1-how-the-cms-renders-pages)
2. [Page templates — converting a full HTML page](#2-page-templates--converting-a-full-html-page)
3. [Component templates — converting a section](#3-component-templates--converting-a-section)
4. [Making content editable (inline editor)](#4-making-content-editable-inline-editor)
5. [Editable field types reference](#5-editable-field-types-reference)
6. [Static vs dynamic components](#6-static-vs-dynamic-components)
7. [Where your CSS, JS, and images go](#7-where-your-css-js-and-images-go)
8. [Nunjucks template variables reference](#8-nunjucks-template-variables-reference)
9. [Using the Import Tool (upload HTML files)](#9-using-the-import-tool-upload-html-files)
10. [End-to-end example: landing page](#10-end-to-end-example-landing-page)
11. [Common problems](#11-common-problems)

---

## 1. How the CMS renders pages

```
Request /about
    │
    ▼
Router looks up page with slug "about" in the DB
    │
    ▼
page.template = "about"
    │
    ├── theme.js renders themes/default/about.html  (your converted HTML file)
    │   passing: { page, isAdmin, isEditing, session, components_html, seo_head }
    │
    └── Any CMS components attached to this page are pre-rendered into components_html
```

**Three things you need to understand:**

- **Page templates** live in `themes/default/` as `.html` files. They are Nunjucks templates — you can use `{{ variable }}` and `{% if %}` anywhere in them.
- **Component templates** live in `themes/default/components/<name>/template.njk`. Each component is a self-contained HTML fragment.
- **The DB** stores page titles, slugs, meta tags, and component instances. Templates only store HTML/CSS structure — content goes in the DB.

---

## 2. Page templates — converting a full HTML page

A **page template** is for pages that have a unique layout: your homepage, about page, landing page, contact page, etc.

### Minimum required changes

Take any static `about.html` and make three small additions:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- 1. Replace the static title with the CMS title variable -->
  <title>{{ page.meta_title or page.title }} — {{ site_title() }}</title>

  <!-- 2. Inject SEO tags (og:, twitter:, canonical, JSON-LD) -->
  {{ seo_head | safe }}

  <!-- your existing CSS -->
  <link rel="stylesheet" href="/assets/css/style.css">
</head>
<body>

  <!-- your existing HTML content here -->

  <!-- 3. Where CMS components will be rendered (optional — add this where you want
       the CMS component zone to appear, e.g. below the hero) -->
  {{ components_html | safe }}

  <!-- 4. Inline editor support (leave this at the bottom — the CMS adds it automatically
       only when an admin is editing) -->
  {% if isAdmin and isEditing %}
  <script>window.CSRF_TOKEN = "{{ csrf_token(session.id) }}";</script>
  {% endif %}

</body>
</html>
```

### Saving the file

Save the file as `themes/default/about.html`.

Then in the admin panel go to **Pages → New Page** and set:
- **Template** field to `about` (the filename without `.html`)
- **Slug** to `about`
- **Status** to Published

The page is now live at `/about`.

### Keeping your own navigation/header

You can use Nunjucks template inheritance to share a header across pages, or just copy the header HTML into each page template. For a site with many similar pages, create a `base.html` layout:

```html
{# themes/default/base.html #}
<!DOCTYPE html>
<html lang="en">
<head>
  <title>{{ page.meta_title or page.title }} — {{ site_title() }}</title>
  {{ seo_head | safe }}
  <link rel="stylesheet" href="/assets/css/style.css">
</head>
<body>
  {% block content %}{% endblock %}
  {% if isAdmin and isEditing %}
  <script>window.CSRF_TOKEN = "{{ csrf_token(session.id) }}";</script>
  {% endif %}
</body>
</html>
```

Then in your page template:
```html
{% extends "base.html" %}
{% block content %}
  <!-- your page-specific HTML here -->
{% endblock %}
```

---

## 3. Component templates — converting a section

A **component** is a reusable HTML fragment — a hero banner, feature grid, testimonials section, pricing table, footer, etc. Unlike page templates (which are one-per-page), the same component template can be instantiated multiple times across different pages.

### File location

```
themes/default/components/
└── my-component/
    └── template.njk
```

The folder name is the component's `name` in the DB. The file must be called `template.njk`.

### Conversion example

**Before — static HTML:**
```html
<section class="hero">
  <h1>We build great websites</h1>
  <p>Fast, modern, and affordable.</p>
  <a href="/contact" class="btn">Get started</a>
</section>
```

**After — component template:**
```html
{# themes/default/components/hero-banner/template.njk #}
<section class="hero" data-id="{{ _comp.id }}">
  <h1 class="edit-textfield" data-field="title">{{ title or "Your Headline" }}</h1>
  <p class="edit-textfield" data-field="subtitle">{{ subtitle or "Your subheadline here." }}</p>
  <a href="{{ button_url or '/contact' }}" class="btn edit-link" data-field="button_text">
    {{ button_text or "Get started" }}
  </a>
</section>
```

**Key differences:**
- The outer element gets `data-id="{{ _comp.id }}"` — this identifies the component to the inline editor.
- Every editable field gets a CSS class (`edit-textfield`, `edit-link`, etc.) and a `data-field="fieldname"` attribute.
- Variables like `{{ title }}` come from the component's JSON content stored in the DB. The `or "fallback"` provides default text when nothing is saved yet.

### Creating the component in the admin

After saving the template file, go to **Admin → Components → New Component**:
- **Name:** `hero-banner` (must match the folder name exactly)
- **Type:** Static
- **Content:** A JSON object with your default field values:

```json
{
  "title": "We build great websites",
  "subtitle": "Fast, modern, and affordable.",
  "button_text": "Get started",
  "button_url": "/contact"
}
```

Save, then add the component to any page via the page editor.

---

## 4. Making content editable (inline editor)

The inline editor activates when an admin visits a page with `?edit=1` in the URL (e.g. `https://example.com/about?edit=1`).

### How it works

1. The outer wrapper of your component or section must have `data-id="{{ _comp.id }}"`.
2. Every field you want editable gets an edit class and a `data-field` attribute.
3. When the admin clicks the element, an edit UI appears over it.

### Rules for the wrapper

The `data-id` must be on a direct ancestor of all editable fields. Typically the outermost element of the component:

```html
<section data-id="{{ _comp.id }}">   <!-- ← required wrapper -->
  <h1 class="edit-textfield" data-field="title">{{ title }}</h1>
  <p class="edit-textfield" data-field="body">{{ body }}</p>
</section>
```

> **Page templates** (not components) do NOT use `data-id`. They use a different editing approach. Only component instances have IDs.

---

## 5. Editable field types reference

| CSS class | `data-field` value | What it edits | Stored as |
|-----------|-------------------|---------------|-----------|
| `edit-textfield` | any name | Plain text (single line or multiline on Enter) | String |
| `edit-link` | any name | The element's visible text | String |
| `edit-image` | any name | Replaces `src` attribute of an `<img>` tag | URL string |
| `edit-alt` | any name | Updates `alt` attribute of the nearest `<img>` | String |

### Text field
```html
<h2 class="edit-textfield" data-field="heading">{{ heading }}</h2>
<p class="edit-textfield" data-field="description">{{ description }}</p>
```

### Link (edits text, not href — change href in the JSON)
```html
<a href="{{ cta_url }}" class="btn edit-link" data-field="cta_text">{{ cta_text }}</a>
```

To make the href editable too, add a separate hidden span or use a second `edit-textfield`:
```html
<!-- Hidden URL field — editor sees it, visitors don't -->
<span class="edit-textfield" data-field="cta_url" style="display:none">{{ cta_url }}</span>
<a href="{{ cta_url }}" class="btn edit-link" data-field="cta_text">{{ cta_text }}</a>
```

### Image
```html
<img src="{{ image_url or '/assets/images/placeholder.jpg' }}"
     alt="{{ image_alt or '' }}"
     class="edit-image"
     data-field="image_url">
<!-- Alt text is a second field on the same image -->
<img src="{{ image_url }}"
     alt="{{ image_alt }}"
     class="edit-image edit-alt"
     data-field="image_url"
     data-field-alt="image_alt">
```

### Full component example with all field types
```html
<section class="feature-card" data-id="{{ _comp.id }}">
  <img src="{{ icon_url or '/assets/images/default-icon.png' }}"
       alt="{{ icon_alt or 'Feature icon' }}"
       class="edit-image"
       data-field="icon_url">
  <h3 class="edit-textfield" data-field="title">{{ title or "Feature Title" }}</h3>
  <p class="edit-textfield" data-field="description">{{ description or "Describe this feature here." }}</p>
  <a href="{{ link_url or '#' }}" class="btn edit-link" data-field="link_text">
    {{ link_text or "Learn more" }}
  </a>
</section>
```

Corresponding default content JSON in the admin:
```json
{
  "icon_url": "/assets/images/feature1.png",
  "icon_alt": "Fast performance",
  "title": "Blazing Fast",
  "description": "Loads in under a second on any device.",
  "link_text": "See benchmarks",
  "link_url": "/performance"
}
```

---

## 6. Static vs dynamic components

There are two component types:

| Type | Content source | Use when |
|------|---------------|----------|
| **Static** | JSON object stored in DB | Editable content blocks — hero, cards, text, images |
| **Dynamic** | A template tag `{% tagname param=value %}` | Auto-generated content — recent posts, forms, listings |

### Static (JSON content)
The CMS parses the JSON into variables and passes them to the template. Each key in the JSON becomes a variable: `{"title": "Hello"}` → `{{ title }}`.

### Dynamic (template tag)
The component's content field is a tag string. The registered tag handler returns HTML:

```
{% recentposts limit=5 category="news" %}
{% services limit=3 %}
{% contactform subject="Website inquiry" %}
```

Dynamic components can't be inline-edited — they output fresh data on every page load. Use them for auto-generated sections.

---

## 7. Where your CSS, JS, and images go

```
themes/
└── default/
    ├── assets/
    │   ├── css/
    │   │   └── style.css          ← main stylesheet
    │   ├── js/
    │   │   └── main.js            ← your custom JavaScript
    │   └── images/
    │       └── logo.png           ← static theme images
    ├── components/
    │   └── hero-banner/
    │       └── template.njk
    └── about.html                 ← page template
```

**Reference assets in templates using absolute paths:**
```html
<link rel="stylesheet" href="/assets/css/style.css">
<script src="/assets/js/main.js" defer></script>
<img src="/assets/images/logo.png" alt="Logo">
```

The `/assets/` URL prefix is served directly from `themes/{active_theme}/assets/` — no CMS processing, straight to the browser.

**Uploaded media** (images uploaded via Admin → Media) lives at `/uploads/filename.ext` and uses the `UPLOAD_PATH` directory.

### Bringing in a custom CSS file from your design

1. Copy your `styles.css` to `themes/default/assets/css/styles.css`.
2. Add a `<link>` to your page template(s).

### Bringing in a CSS framework (Bootstrap, Tailwind CDN)

Include CDN links in your page templates as normal:
```html
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
```
Or download the files and put them in `themes/default/assets/`.

### Inline component styles

Components can include `<style>` blocks. They render inline in the page — valid for scoped, small styles. For large stylesheets, put them in `assets/css/` and link from the page template.

---

## 8. Nunjucks template variables reference

### Available on every page template

| Variable | Type | Description |
|----------|------|-------------|
| `site_title()` | Function | Site name from Settings |
| `site_tagline()` | Function | Site tagline from Settings |
| `site_url()` | Function | Full site URL (e.g. `https://example.com`) |
| `year()` | Function | Current year — use for copyright lines |
| `seo_head` | String (safe HTML) | `<meta>`, `<link>`, and JSON-LD tags for this page |
| `components_html` | String (safe HTML) | All rendered components attached to this page |
| `page` | Object | The page record: `.title`, `.slug`, `.meta_title`, etc. |
| `isAdmin` | Boolean | True when the visitor is logged in as admin |
| `isEditing` | Boolean | True when `?edit=1` is in the URL |
| `csrf_token(session.id)` | Function | CSRF token — needed for any form submission |

### Available on blog pages

| Variable | Description |
|----------|-------------|
| `post` | Single post: `.title`, `.content`, `.slug`, `.excerpt`, `.featured_image`, `.created_at` |
| `posts` | Array of posts on list/archive pages |
| `category` | Category object on `/blog/category/:slug` |
| `tag` | Tag object on `/blog/tag/:slug` |
| `page` | Current page number (pagination) |
| `total_pages` | Total number of pages |

### Available in component templates

| Variable | Description |
|----------|-------------|
| `_comp` | The component DB record — use `_comp.id` for the `data-id` wrapper |
| `isAdmin` | True when visitor is admin |
| `isEditing` | True when editing |
| All JSON keys | Every key in the component's content JSON becomes a top-level variable |

### Built-in Nunjucks filters

| Filter | Example | Output |
|--------|---------|--------|
| `date` | `{{ post.created_at \| date }}` | `April 25, 2026` |
| `json_parse` | `{{ meta_json \| json_parse }}` | Object |
| `safe` | `{{ html_content \| safe }}` | Renders HTML without escaping |
| `truncate(n)` | `{{ text \| truncate(100) }}` | First 100 chars + `…` |
| `upper` / `lower` | `{{ title \| upper }}` | UPPERCASE / lowercase |

---

## 9. Using the Import Tool (upload HTML files)

The Import Tool at **Admin → Developer → Import** lets you upload HTML files directly without FTP or SSH access.

### Single file import

1. Go to **Admin → Developer → Import**.
2. Choose **Import type:** Page Template or Component Template.
3. Enter a **Name** (slug style: `about`, `hero-banner`, `pricing-table`).
4. Upload your `.html` file.
5. Check **Inject CMS variables** (recommended) — this automatically adds:
   - `{{ page.meta_title or page.title }} — {{ site_title() }}` as the page title
   - `{{ seo_head | safe }}` before `</head>`
   - `{% if isAdmin and isEditing %}` CSRF script before `</body>`
6. For pages, optionally check **Add components slot** to inject `{{ components_html | safe }}` in the body.
7. Click **Import**.

For **Page Template** imports: a draft page is created in the DB automatically with the slug you entered. Go to **Pages** to publish it.

For **Component Template** imports: the template file is created. Go to **Components → New Component**, enter the same name, and add it to a page.

### Batch zip import

Upload a single `.zip` file containing multiple HTML files. The zip **must** use this folder structure:

```
my-site.zip
├── pages/
│   ├── about.html
│   ├── services.html
│   └── contact.html
└── components/
    ├── hero-banner.html
    ├── features-grid.html
    └── testimonials.html
```

- Files in `pages/` → imported as page templates, a draft DB page created for each
- Files in `components/` → imported as component templates (no DB record — create instances manually)
- You can include CSS/JS files alongside the HTML — they are copied to `themes/default/assets/imported/`

After batch import, a summary shows which files were imported and which had errors.

### What the import tool does NOT do

- **It does not move external CSS/JS that your HTML references.** If your HTML has `<link href="styles.css">` pointing to a local file, you need to either upload that file separately (via the zip) or host it elsewhere.
- **It does not parse React, Vue, or Angular components.** Upload rendered static HTML only.
- **It does not change content in the DB.** Templates define structure; real content is managed through the page editor and component forms.

---

## 10. End-to-end example: landing page

Let's say you have a freelance designer's landing page as a static HTML file.

### Original static HTML (simplified)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Jane Doe — Freelance Designer</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <nav>
    <a href="/">Home</a>
    <a href="/about">About</a>
    <a href="/work">Work</a>
    <a href="/contact">Contact</a>
  </nav>

  <section class="hero">
    <h1>I design products people love.</h1>
    <p>Based in London. Available for freelance.</p>
    <a href="/contact" class="btn">Let's talk</a>
  </section>

  <section class="services">
    <div class="service-card">
      <h3>UX Design</h3>
      <p>User research, wireframes, prototypes.</p>
    </div>
    <div class="service-card">
      <h3>Brand Identity</h3>
      <p>Logo, colors, typography systems.</p>
    </div>
  </section>

  <footer>
    <p>© 2026 Jane Doe</p>
  </footer>
</body>
</html>
```

### Step 1: Move assets

Copy `style.css` to `themes/default/assets/css/landing.css`.

### Step 2: Convert the page template

Save as `themes/default/landing.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ page.meta_title or page.title }} — {{ site_title() }}</title>
  {{ seo_head | safe }}
  <link rel="stylesheet" href="/assets/css/landing.css">
</head>
<body>

  <nav>
    <a href="/">Home</a>
    <a href="/about">About</a>
    <a href="/work">Work</a>
    <a href="/contact">Contact</a>
  </nav>

  <!-- Hero component zone -->
  {{ components_html | safe }}

  <footer>
    <p>© {{ year() }} {{ site_title() }}</p>
  </footer>

  {% if isAdmin and isEditing %}
  <script>window.CSRF_TOKEN = "{{ csrf_token(session.id) }}";</script>
  {% endif %}

</body>
</html>
```

Notice the hero and services sections were **removed** from the page template and will become components instead — that's the CMS pattern: page templates are thin wrappers, content lives in components.

### Step 3: Create the hero component

Save as `themes/default/components/hero-landing/template.njk`:

```html
<section class="hero" data-id="{{ _comp.id }}">
  <h1 class="edit-textfield" data-field="headline">
    {{ headline or "Your headline here" }}
  </h1>
  <p class="edit-textfield" data-field="subtext">
    {{ subtext or "Your subtext here" }}
  </p>
  <a href="{{ cta_url or '/contact' }}" class="btn edit-link" data-field="cta_text">
    {{ cta_text or "Let's talk" }}
  </a>
</section>
```

### Step 4: Create the services section component

Save as `themes/default/components/service-cards/template.njk`:

```html
<section class="services" data-id="{{ _comp.id }}">
  <div class="service-card">
    <h3 class="edit-textfield" data-field="service1_title">{{ service1_title or "Service One" }}</h3>
    <p class="edit-textfield" data-field="service1_desc">{{ service1_desc or "Description here." }}</p>
  </div>
  <div class="service-card">
    <h3 class="edit-textfield" data-field="service2_title">{{ service2_title or "Service Two" }}</h3>
    <p class="edit-textfield" data-field="service2_desc">{{ service2_desc or "Description here." }}</p>
  </div>
</section>
```

### Step 5: Set up in the admin

1. **Create the page:** Admin → Pages → New Page
   - Title: `Home`
   - Slug: (leave blank — this becomes the homepage)
   - Template: `landing`
   - Status: Published

2. **Create the hero component:** Admin → Components → New Component
   - Name: `hero-landing`
   - Type: Static
   - Content JSON:
     ```json
     {
       "headline": "I design products people love.",
       "subtext": "Based in London. Available for freelance.",
       "cta_text": "Let's talk",
       "cta_url": "/contact"
     }
     ```

3. **Create the services component:** Admin → Components → New Component
   - Name: `service-cards`
   - Type: Static
   - Content JSON:
     ```json
     {
       "service1_title": "UX Design",
       "service1_desc": "User research, wireframes, prototypes.",
       "service2_title": "Brand Identity",
       "service2_desc": "Logo, colors, typography systems."
     }
     ```

4. **Add components to the page:** Admin → Pages → Edit Page (the one you created) → Add Component → select `hero-landing` and `service-cards` in order.

5. **Test inline editing:** Visit `/?edit=1` while logged in. Click any text to edit it.

---

## 11. Common problems

**Component content shows default text instead of saved values**

The template variable name must exactly match the JSON key. If your JSON has `"headline"` but your template uses `{{ title }}`, you'll always see the fallback. Check Admin → Components → edit the instance to see the stored JSON.

**`data-id="{{ _comp.id }}"` shows literally in the HTML**

The inline editor CSS classes and `data-id` only render when `isEditing` is true. If you see the literal Nunjucks code, the template is not being processed through the CMS — the file might be served as a static file instead of through the theme engine.

**Inline editor doesn't appear when I visit `?edit=1`**

- You must be logged in as an admin.
- The page must use the CMS page route (not `/assets/`).
- The component wrapper must have `data-id="{{ _comp.id }}"` on the outermost element.
- The `inline-editor.js` script is only injected when `isEditing` is true — check `renderComponents()` in `theme.js`.

**CSS from my design is missing**

Your HTML probably referenced CSS with a relative path like `href="style.css"`. After conversion that file no longer exists at that relative path. Copy the CSS to `themes/default/assets/css/` and update the `<link>` to `/assets/css/style.css`.

**Images show as broken after import**

Same as CSS — images referenced with relative paths break. Upload images via Admin → Media and use the `/uploads/filename.ext` URL in your templates, or copy them to `themes/default/assets/images/` and reference as `/assets/images/filename.ext`.

**`{{ components_html | safe }}` is empty**

No components have been added to this page yet. Go to Admin → Pages → Edit Page and add some components.

**My `<script>` tags were stripped from a component**

The component sanitizer blocks `<script>` tags for security (HMAC-signed static components). Put JavaScript in `themes/default/assets/js/` and include it from your page template, or use a dynamic component (type = `dynamic`) whose tag handler can return JS.
