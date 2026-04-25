# Veave CMS — User Guide

> **Who this is for:** site owners, content editors, and administrators who use the CMS day-to-day. No coding knowledge required for anything in this guide.

---

## Table of contents

1. [Installation & first setup](#1-installation--first-setup)
2. [Admin panel overview](#2-admin-panel-overview)
3. [Pages](#3-pages)
4. [Components](#4-components)
5. [Inline editor (frontend editing)](#5-inline-editor-frontend-editing)
6. [Blog](#6-blog)
7. [Media library](#7-media-library)
8. [Users & groups](#8-users--groups)
9. [URL redirects](#9-url-redirects)
10. [Settings](#10-settings)
11. [FAQ](#11-faq)

---

## 1. Installation & first setup

### Option A — Run from source (development)

```bash
bun install
cp .env.development .env
bun dev
```

Open **http://localhost:8080**.

### Option B — Run the binary (production)

```bash
scp veavecms user@yourserver:/srv/cms/
ssh user@yourserver
cd /srv/cms
NODE_ENV=production ./veavecms
```

Open **http://your-domain.com**.

### First-run setup

The first time you visit the site, you are redirected to **/admin/setup**.

1. Enter a username and a strong password.
2. Click **Initialize System**.
3. You are redirected to the login page.
4. Log in with those credentials.

> The setup page is only accessible when no users exist. Once the first admin is created, the page returns a 400 error — it cannot be used to create a second superuser.

---

## 2. Admin panel overview

The admin panel lives at **/admin**. Every page has:

| UI element | Purpose |
|-----------|---------|
| **Sidebar** | Navigate between sections |
| **DEV / PROD badge** | Reminds you which environment you're in |
| **Yellow banner** | Appears in development mode only — warns that changes don't affect production |
| **Profile pill** | Shows logged-in username |

### Sidebar sections

| Link | What you manage |
|------|----------------|
| Dashboard | Stats at a glance — pages, posts, components, media, users |
| Pages | CMS pages (not blog posts) |
| Components | Reusable content blocks |
| Blog | Blog posts + categories |
| Media | Uploaded images and PDFs |
| Redirects | Old URL → new URL mappings |
| Users | Manage who can log in |
| Groups | Manage permission sets |
| Settings | Site-wide config |
| Developer | Edit Nunjucks component templates |

---

## 3. Pages

Pages are the main content area of the site. Each page has a URL (its **slug**), a status, and a set of components arranged in order.

### Creating a page

1. Go to **Pages → Create New Page**.
2. Fill in the title and optional slug.
   - Slug becomes the URL: `your-site.com/about`
   - Leave it blank to auto-generate from the title.
3. Select a template (usually `page`).
4. Click **Create Page**.

### Adding components to a page

After creating a page, open it with the **Edit** button. You'll see an **Add Component** panel:

1. Select a component from the dropdown (existing components from the library, or create a new one first).
2. Click **Add to Page**.
3. Components appear in order — drag to reorder (if your theme supports it).

### Publishing a page

On the page editor, click **Toggle Status**. The status switches between `draft` and `published`.

- `draft` — only logged-in admins can see it (append `?preview=1` to the URL).
- `published` — visible to everyone.

### Editing the homepage

The homepage (`/`) shows blog posts by default. To use a static page as the homepage:

1. Create and publish a page with the slug left **empty** (not `/`, just blank).
2. Go to **Settings → General** and set "Home Page Displays" to "A Static Page", selecting that page.

---

## 4. Components

Components are reusable content blocks. There are two types:

| Type | What it is | Edited how |
|------|-----------|------------|
| **Static** | HTML/CSS stored in the database | Inline editor (content mode) or Developer panel (structure mode) |
| **Dynamic** | A template tag like `{% recentposts limit=5 %}` | Change the tag parameters |

### Creating a component

1. Go to **Components → Create New Component**.
2. Give it an internal name (e.g. "Homepage Hero").
3. Pick a template type (Hero, Navigation, Post Loop, Static Content, etc.).
4. Optionally check **Make Global** — global components appear on every page automatically.
5. Click **Create Component**.

### Global vs page-specific components

- **Global** components (header, footer, navigation) are automatically injected into every page render. You don't need to add them per page.
- **Page-specific** components are added individually to each page.

### Editing a component's code

Go to **Developer → Component Templates**, click **Edit Code** on the component. This opens a code editor for the Nunjucks template. Changes here affect all instances of that component type.

---

## 5. Inline editor (frontend editing)

When you are logged in and visit a published page, you can edit text and images directly on the page without going to the admin.

### Activating edit mode

Append `?edit=1` to any page URL:

```
https://your-site.com/about?edit=1
```

A green toolbar appears at the top. Elements marked as editable get a dashed outline when you hover over them.

### Editing text

Click any text element with an editable outline. It becomes live-editable. Type your changes.

### Editing images

Click an image with an editable outline. Enter a new image URL when prompted.

### Saving

Click **Save Changes** in the toolbar. All changes are saved in one request.  
Click **Discard** to reload the page and undo all unsaved changes.

> Changes are re-sanitized on the server before saving — you cannot introduce harmful code through the inline editor.

---

## 6. Blog

### Creating a blog post

1. Go to **Blog → New Post**.
2. Fill in the **Title** — the slug auto-generates from it.
3. Write your **Content** in the large text area (HTML is supported and sanitized on save).
4. Optionally add an **Excerpt** — shown in post listings and meta descriptions if set.
5. Fill in the right-side panels:
   - **Status** — `Draft` or `Published`
   - **Featured Image** — paste the URL of an uploaded image
   - **Featured Image Alt** — required for accessibility
   - **Categories** — tick one or more
   - **Tags** — comma-separated; new tags are created automatically
6. Fill in the **SEO panel** — these fields directly affect search engine appearance.
7. Click **Create Post**.

### SEO fields explained

| Field | Used for | Falls back to |
|-------|----------|---------------|
| SEO Title | `<title>` tag | Post title |
| Meta Description | `<meta name="description">` | Excerpt |
| OG Title | Facebook/LinkedIn share | SEO Title |
| OG Description | Facebook/LinkedIn share | Meta Description |
| Schema Type | JSON-LD `@type` | `BlogPosting` |

> **Meta description limit:** 160 characters. The save handler rejects anything longer.

### Changing a slug after publishing

You can change the slug on an already-published post. Veave CMS automatically creates a **301 redirect** from the old URL to the new one so bookmarks and search engine links don't break.

### Categories

Go to **Blog → (sidebar sub-link is "Blog")** and look for a link to **Categories** in the blog list header area (or navigate to `/admin/blog/categories`).

Each category has:
- Name and slug (URL segment: `/blog/category/your-slug`)
- Description — displayed on the category archive page
- Meta description — for search engines on the archive page

### Tags

Tags are created on the fly when you type them into the post editor's **Tags** field. Separate multiple tags with commas. The tag archive lives at `/blog/tag/your-tag-slug`.

---

## 7. Media library

### Uploading files

1. Go to **Media**.
2. Click the upload area or drag files onto it.
3. Multiple files can be uploaded in one go.

**Supported file types:** JPEG, PNG, WebP, GIF, SVG, PDF (up to 10 MB each by default).

> Veave CMS validates files by their actual content (magic bytes), not just the file extension. Renaming a PHP file to `.jpg` will be rejected.

### Using uploaded files

After uploading, click **Copy URL** on any file. Paste that URL into:
- A blog post's **Featured Image** field
- A component template's `src` attribute
- Any `<img>` in the inline editor

### Deleting media

Click **Delete** on the file card. The file is removed from the server and from the database. Check your pages first — any `<img>` tags pointing to that URL will show broken images.

---

## 8. Users & groups

### Creating a user

1. Go to **Users → New User**.
2. Set username, email, and a strong password.
3. Assign the user to one or more **Groups**.
4. Optionally tick **Superuser** — superusers bypass all permission checks and have full access to everything.
5. Click **Create User**.

### Editing a user

Click **Edit** next to a user. You can:
- Change username and email
- Reset password (leave blank to keep current)
- Toggle **Active** — inactive users cannot log in
- Reassign groups

### Groups

Groups are named sets of permissions. Three groups are seeded on first install:

| Group | What members can do |
|-------|---------------------|
| **Administrators** | Everything — all type-level permissions |
| **Editors** | View/edit pages, view/edit/publish blog posts, upload media |
| **Authors** | Edit blog posts, upload media |

### Creating a custom group

1. Go to **Groups → New Group**.
2. Enter a name and optional description.
3. Click **Create Group**.
4. Click **Edit** on the group to assign permissions from the checklist.

### Permission model

Permissions come in two scopes:

| Scope | What it means | Example |
|-------|--------------|---------|
| **Type-level** | Access to all objects of a type | `edit_page` — can edit any page |
| **Object-level** | Access to one specific object | `edit_page` on page #5 only |

Object-level permissions are created automatically when a page, component, or blog post is created. Assign them to a user directly or through a group via the **Edit Group** page.

> Superusers skip all permission checks — they always have access.

---

## 9. URL redirects

Go to **Redirects**. The page shows a form at the top and the existing redirect list below.

### Adding a redirect

Fill in:
- **From** — the old path, e.g. `/old-page`
- **To** — the new path or full URL, e.g. `/new-page`
- **Type** — 301 (permanent, cached by browsers and search engines) or 302 (temporary)

Click **Add**.

### When to use 301 vs 302

| Code | Use when |
|------|---------|
| 301 | You've permanently moved a page and want search engines to transfer its ranking |
| 302 | Temporarily pointing to another page while you rebuild the original |

> Slug changes on published blog posts automatically create 301 redirects — you don't need to add them manually.

---

## 10. Settings

### General

| Setting | Effect |
|---------|--------|
| Site Title | Shown in the browser tab and meta tags |
| Tagline | Subtitle shown in themes that support it |
| Posts Per Page | Number of posts on listing pages |
| Home Page Displays | "Latest Posts" or a specific CMS page |

### SEO

| Setting | Effect |
|---------|--------|
| Google Analytics ID | Appended to every page if your theme outputs it |
| Sitemap includes pages | Whether CMS pages appear in `/sitemap.xml` |
| Sitemap includes posts | Whether blog posts appear in `/sitemap.xml` |

Changing any SEO setting immediately invalidates the sitemap cache — the next request to `/sitemap.xml` regenerates it.

### Hosting

| Setting | Effect |
|---------|--------|
| Site URL | Used in sitemap, canonical links, and OG tags. Example: `https://example.com` |
| Domain | Used in DNS instructions panel |

> The DNS panel shows the A records you need to set with your registrar to point your domain at your server.

---

## 11. FAQ

**Q: I forgot my password. How do I reset it?**  
A: Another admin can reset it from **Users → Edit User → New Password**. If there are no other admins, see the [Developer Guide](DEVELOPER_GUIDE.md#resetting-the-admin-password) for the CLI reset procedure.

**Q: Can I have multiple sites on one installation?**  
A: No — one installation serves one site. Run a second process on a different port for a second site.

**Q: My page shows "Page not found" after I published it.**  
A: Check that the page slug doesn't conflict with a blog post slug or a reserved path like `/blog`, `/sitemap.xml`, or `/admin`. Also check the Redirects table — an old redirect might be catching the URL first.

**Q: Images aren't showing after I uploaded them.**  
A: Copy the URL from the Media library (it looks like `/uploads/uuid.jpg`) and paste it directly into the browser. If it 404s, the file may have been deleted from disk. Re-upload it.

**Q: The sitemap isn't updating.**  
A: The sitemap is cached. It regenerates automatically when a page or post is published or unpublished. You can also save the SEO settings (without changing anything) to force an immediate regeneration.

**Q: How do I change the look of the site?**  
A: See the [Theme Guide](THEME_GUIDE.md). Themes live in `themes/your-theme-name/`.

**Q: Can editors publish posts without admin approval?**  
A: Yes. Assign users to the **Editors** group — it includes the `publish_blogpost` permission. If you want a review workflow, create a custom group without that permission and only add it to senior editors.

**Q: What happens if I delete a component that's on a page?**  
A: The database prevents deletion — it will return an error saying the component is in use. Remove it from all pages first (via each page's editor), then delete it.

**Q: The inline editor isn't showing editable elements.**  
A: The component template must use the `data-editable` attribute on elements you want to edit inline. See [Theme Guide](THEME_GUIDE.md#editable-regions).
