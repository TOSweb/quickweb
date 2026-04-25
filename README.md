# Veave CMS

A hybrid page-builder CMS built on **Bun + JavaScript + SQLite**.  
No PHP, no MySQL, no runtime dependencies beyond the single binary.

```
bun install && bun dev
```

Open **http://localhost:8000** — first visit redirects to setup.

---

## What it does

| Feature | Details |
|---------|---------|
| **Page builder** | Drag components onto pages, edit text inline |
| **Blog** | Full blog with categories, tags, SEO fields, drafts |
| **Permissions** | Django-style groups and per-object permissions |
| **Plugins** | Drop a folder in `plugins/`, zero config |
| **Themes** | Nunjucks templates, swap themes from settings |
| **Media** | Upload images/PDFs, magic-byte validation, grid library |
| **SEO** | sitemap.xml, robots.txt, JSON-LD, Open Graph built in |
| **Security** | CSRF, HMAC-signed content, rate limiting, security headers |

---

## Requirements

| Runtime | Version |
|---------|---------|
| [Bun](https://bun.sh) | 1.0+ (recommended) |
| Node.js | 18+ (fallback) |

No database server needed — SQLite is embedded.

---

## Quick start

```bash
# Clone and install
git clone <repo>
cd buncms
bun install

# Copy dev env file
cp .env.development .env

# Start with hot reload
bun dev
```

Visit **http://localhost:8080/admin/setup** to create the first admin account, then **http://localhost:8080/admin**.

---

## Documentation

| Document | Audience | Contents |
|----------|----------|----------|
| **[User Guide](docs/USER_GUIDE.md)** | Editors, admins | Installation → daily use of every admin feature |
| **[Developer Guide](docs/DEVELOPER_GUIDE.md)** | Backend developers | Architecture, database, security, permission API |
| **[Theme Guide](docs/THEME_GUIDE.md)** | Frontend developers | Building and customising themes |
| **[Plugin Guide](docs/PLUGIN_GUIDE.md)** | Extension authors | Full plugin API with worked examples |
| **[Deployment Guide](docs/DEPLOYMENT.md)** | DevOps / self-hosters | VPS, systemd, Nginx, SSL, backups |
| **[Security Guide](SECURITY.md)** | Developers | Threat model, checklist, known tradeoffs |

---

## Project layout

```
src/
  index.js          Entry point
  router.js         Public request router
  db.js             Schema + DB init + seeding
  config.js         Environment loader
  admin/
    router.js       Admin route dispatcher
    auth.js         Login / setup / logout pages
    blog.js         Blog post + category CRUD
    components.js   Component CRUD
    dashboard.js    Dashboard page
    developer.js    Component template editor
    media.js        File upload + library
    pages.js        Page CRUD
    redirects.js    URL redirect manager
    settings.js     Site settings
    users.js        User + group management
    base.js         Admin HTML shell + sidebar
  core/
    auth.js         Sessions, password hashing
    builtins.js     Built-in template tags
    csrf.js         CSRF token generate/verify
    headers.js      Security headers middleware
    permissions.js  Permission engine
    plugins.js      Plugin loader + hook system
    ratelimit.js    Login rate limiter
    sanitizer.js    HTML sanitizer + HMAC signing
    tags.js         Template tag registry
    theme.js        Nunjucks engine + component renderer
    update.js       Version check
  seo/
    meta.js         OG/Twitter meta tags
    schema.js       JSON-LD structured data
    sitemap.js      sitemap.xml + robots.txt
themes/
  default/          Default theme (Nunjucks + CSS)
plugins/            Drop plugin folders here
config/
  development.js    Dev config
  production.js     Production config
data/
  cms-dev.db        Dev database (auto-created)
  uploads/          Uploaded media
```

---

## Build single binary

```bash
NODE_ENV=production bun run build
# Output: ./veavecms  (~15 MB, self-contained)

scp veavecms user@server:/srv/cms/veavecms
```

---

## License

MIT
