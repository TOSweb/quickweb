# Veave CMS

A full-featured CMS built on **Bun + JavaScript** with SQLite or MySQL.  
No PHP. No cloud dependency. Runs as a single process.

```bash
bun install && bun dev
```

Open **http://localhost:8000** — first visit redirects to setup.

---

## What's inside

### Content
| Feature | Details |
|---------|---------|
| **Page builder** | Compose pages from reusable components, edit content inline |
| **Blog** | Posts, categories, drafts, per-post SEO fields |
| **Custom content types** | Create Services, Products, Portfolio, etc. from the UI — no code. Each type gets its own DB table, admin CRUD, public list + detail pages, and sitemap entries |
| **Rich text editor** | TinyMCE embedded — full formatting, tables, image embeds |
| **Media library** | Upload images and files; magic-byte MIME validation; reuse across the site |
| **URL redirects** | Manage 301/302 redirects from the admin |

### Publishing
| Feature | Details |
|---------|---------|
| **SEO** | Per-page meta title, description, Open Graph, JSON-LD, canonical URLs |
| **Sitemap** | Auto-generated `sitemap.xml` — includes pages, posts, and all content types |
| **robots.txt** | Served automatically |
| **Google Analytics** | Paste your GA4 ID in settings; injected on every page |
| **Custom `<head>`** | Add CDN scripts, pixels, or any arbitrary HTML globally |
| **Homepage control** | Show latest posts or set any static page as the homepage |

### Developer
| Feature | Details |
|---------|---------|
| **Themes** | Nunjucks templates; swap theme from settings |
| **Plugins** | Drop a folder in `plugins/` — zero config required |
| **Component developer** | Edit component HTML/CSS/JS templates from the admin UI |
| **Component import** | Import components from zip packages |
| **Plugin manager** | Upload, enable, and delete plugins from the admin |
| **Public routing** | Content types get `/:type/:slug` (detail) and `/:type` (list with pagination, filters, and sort) |

### Administration
| Feature | Details |
|---------|---------|
| **Users & Groups** | Django-style groups with per-object permissions |
| **Multi-user** | Superuser, editors, restricted roles |
| **Settings** | Site title, logo, favicon, tagline, posts per page |
| **Env & Secrets** | Manage the `.env` file from the admin (superuser only) — secrets never displayed, SET/NOT SET badges, one-click secret generation |
| **Hosting guide** | Step-by-step deploy wizard for Railway, Render, Fly.io, Coolify, VPS, and cPanel — auto-generated secrets, copy buttons, browser-persisted checklist |

### Security
| Feature | Details |
|---------|---------|
| **CSRF protection** | HMAC-signed tokens on every form |
| **Session security** | Signed sessions with configurable secret |
| **Content integrity** | HMAC-signed rich text to detect tampering |
| **Rate limiting** | Login endpoint rate limiter |
| **Security headers** | CSP, HSTS, X-Frame-Options, etc. served on every response |
| **Input sanitization** | HTML sanitizer strips dangerous tags from user content |

---

## Requirements

| Runtime | Version |
|---------|---------|
| [Bun](https://bun.sh) | 1.0+ |

No database server needed by default — SQLite is embedded. MySQL is supported via environment variables.

---

## Quick start

```bash
git clone <repo>
cd buncms
bun install

cp .env.development .env   # adjust as needed

bun dev                    # hot reload on file changes
```

Visit **http://localhost:8080/admin/setup** to create the first admin account.

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Port the server listens on |
| `SITE_URL` | — | Full public URL, e.g. `https://example.com` |
| `SESSION_SECRET` | — | Random string; signs sessions |
| `HMAC_SECRET` | — | Random string; signs content |
| `CSRF_SECRET` | — | Random string; signs CSRF tokens |
| `DB_PATH` | `./data/cms.db` | SQLite file path |
| `DB_HOST` | — | Set to enable MySQL instead of SQLite |
| `DB_NAME` | — | MySQL database name |
| `DB_USER` | — | MySQL username |
| `DB_PASSWORD` | — | MySQL password |

Generate all secrets from the **Env & Secrets** page in the admin, or use:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Custom content types

The CMS ships a built-in content type engine — no plugin needed. Go to **Admin → Content Types → New** and define your schema:

- Name your type (e.g. "Services")
- Add fields: text, textarea, rich text, number, email, URL, date, select, checkbox, image
- Choose a Nunjucks template for the list page and one for the detail page
- Toggle public URLs on/off

The CMS then:
- Creates the database table automatically
- Adds an admin CRUD section to the sidebar
- Serves `GET /services` (list — paginated, filterable, sortable) and `GET /services/:slug` (detail)
- Includes all published items in `sitemap.xml`

---

## Themes

Templates live in `themes/<name>/`. The active theme is set in Settings.

| Template variable | Available on |
|-------------------|-------------|
| `page`, `components` | Page routes |
| `post`, `posts`, `categories` | Blog routes |
| `items`, `pagination_html`, `filter_html` | Content type list views |
| `item` | Content type detail views |

See [Theme Guide](docs/THEME_GUIDE.md) for the full variable reference.

---

## Plugins

Drop a folder into `plugins/` and restart. A minimal plugin looks like:

```js
// plugins/my-plugin/index.js
export default function myPlugin(cms) {
  cms.addRoute("GET", "/hello", () => new Response("hello"));
}
```

See [Plugin Guide](docs/PLUGIN_GUIDE.md) for the full API including content types, hooks, and template tags.

---

## Build a self-contained binary

```bash
NODE_ENV=production bun run build
# Output: ./veavecms (~15 MB, no runtime needed)

scp veavecms user@server:/srv/cms/veavecms
```

---

## Deploy

The admin includes a **Hosting & Deploy** guide at `/admin/hosting` with step-by-step instructions for:

- **Railway** — easiest, free tier, auto-deploy from GitHub
- **Render** — free tier, GitHub integration
- **Fly.io** — fast global edge deployment
- **Coolify** — self-hosted on your own server
- **VPS / Linux** — DigitalOcean, Hetzner, Linode with systemd + Nginx
- **cPanel** — shared hosting via Node.js app panel

Each guide auto-generates secure secrets and provides copy buttons for every value.

---

## Project layout

```
src/
  index.js              Entry point + Bun.serve
  router.js             Public request router (pages, blog, content types)
  db.js                 Schema, DB init, settings helpers
  config.js             Environment loader
  db/
    sqlite.js           SQLite adapter
    mysql.js            MySQL adapter
  admin/
    router.js           Admin route dispatcher
    auth.js             Login / setup / logout
    blog.js             Blog posts + categories CRUD
    components.js       Component CRUD
    content-types.js    Content type schema management
    content-type.js     Content type item CRUD (dynamic)
    dashboard.js        Dashboard page
    developer.js        Component template editor
    env.js              .env manager (superuser)
    hosting-guide.js    Hosting setup wizard
    importer.js         Component import from zip
    media.js            File upload + library
    pages.js            Page builder CRUD
    plugins.js          Plugin upload + management
    redirects.js        URL redirect manager
    settings.js         Site settings
    users.js            Users + groups management
    base.js             Admin HTML shell + sidebar
  core/
    auth.js             Sessions, password hashing
    builtins.js         Built-in template tags
    csrf.js             CSRF token generate/verify
    headers.js          Security headers middleware
    permissions.js      Permission engine
    plugins.js          Plugin loader + hook system + content type registry
    ratelimit.js        Login rate limiter
    sanitizer.js        HTML sanitizer + HMAC signing
    tags.js             Template tag registry
    theme.js            Nunjucks engine + component renderer
    update.js           Version checker
  seo/
    meta.js             OG / Twitter meta tags
    schema.js           JSON-LD structured data
    sitemap.js          sitemap.xml + robots.txt
themes/
  default/              Default Nunjucks theme
plugins/                Drop plugin folders here
config/
  development.js        Dev config overrides
  production.js         Production config overrides
data/
  cms-dev.db            Dev SQLite database (auto-created)
  uploads/              Uploaded media files
docs/
  USER_GUIDE.md         Editors and admins
  DEVELOPER_GUIDE.md    Architecture, DB, security, permission API
  THEME_GUIDE.md        Building and customising themes
  PLUGIN_GUIDE.md       Full plugin API with examples
  DEPLOYMENT.md         VPS, systemd, Nginx, SSL, backups
```

---

## Documentation

| Document | Audience |
|----------|----------|
| [User Guide](docs/USER_GUIDE.md) | Editors, content managers |
| [Developer Guide](docs/DEVELOPER_GUIDE.md) | Backend developers |
| [Theme Guide](docs/THEME_GUIDE.md) | Frontend / theme authors |
| [Plugin Guide](docs/PLUGIN_GUIDE.md) | Plugin authors |
| [Deployment Guide](docs/DEPLOYMENT.md) | DevOps / self-hosters |
| [Security Guide](SECURITY.md) | Security review |

---

## License

**MIT + Commons Clause** — free to use, modify, and distribute. You may not sell
the software or offer it as a hosted/managed service for a fee.  
See [LICENSE](LICENSE) for the full text and plain-English summary.
