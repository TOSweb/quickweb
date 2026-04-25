# MyCMS — Deployment Guide

> **Who this is for:** developers and system administrators deploying MyCMS to a server or cloud hosting provider.

---

## Table of contents

1. [Choosing a hosting option](#1-choosing-a-hosting-option)
2. [Environment variables reference](#2-environment-variables-reference)
3. [Option A — Cheap Node.js app hosting (Railway, Render, Fly.io)](#3-option-a--cheap-nodejs-app-hosting-railway-render-flyio)
4. [Option B — VPS with Bun/Node + Nginx](#4-option-b--vps-with-bunnode--nginx)
5. [Option C — Single binary (no runtime needed)](#5-option-c--single-binary-no-runtime-needed)
6. [Persistent storage — the critical detail for cloud hosting](#6-persistent-storage--the-critical-detail-for-cloud-hosting)
7. [Nginx reverse proxy config](#7-nginx-reverse-proxy-config)
8. [SSL with Let's Encrypt](#8-ssl-with-lets-encrypt)
9. [systemd service (VPS only)](#9-systemd-service-vps-only)
10. [Backups](#10-backups)
11. [Monitoring and logs](#11-monitoring-and-logs)
12. [Updating MyCMS](#12-updating-mycms)
13. [FAQ](#13-faq)

---

## 1. Choosing a hosting option

| Option | Cost | Difficulty | Best for |
|--------|------|-----------|---------|
| **Railway** | ~$5/mo (Hobby) or free trial | Easy | Fastest first deploy, no server management |
| **Render** | Free tier / $7/mo | Easy | Free experimentation; upgrade for persistent disk |
| **Fly.io** | ~$3–10/mo | Medium | Global edge deployment, good free tier |
| **VPS (Hetzner, DigitalOcean, Vultr)** | $4–6/mo | Medium | Full control, best value at scale |
| **Single binary on any Linux host** | Free if you have a server | Easy | Shared hosting where you can run binaries |

> **SQLite + uploads require persistent storage.** Platforms like Render's free tier and Railway's ephemeral containers reset the filesystem on every deploy. Read [Section 6](#6-persistent-storage--the-critical-detail-for-cloud-hosting) before choosing.

---

## 2. Environment variables reference

MyCMS reads these at startup. Set them in your hosting dashboard or in a `.env` file (never commit `.env` to git).

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | Yes | `development` | Set to `production` for all live deployments |
| `PORT` | No | `8080` | Port the server listens on |
| `SESSION_SECRET` | Yes (prod) | insecure dev default | Random string ≥ 32 chars — signs session cookies |
| `HMAC_SECRET` | Yes (prod) | insecure dev default | Random string ≥ 32 chars — signs stored HTML content |
| `CSRF_SECRET` | Yes (prod) | insecure dev default | Random string ≥ 32 chars — signs CSRF tokens |
| `DB_PATH` | No | `./data/cms.db` | Absolute path to the SQLite database file |
| `UPLOAD_PATH` | No | `./data/uploads` | Absolute path to the uploads directory |
| `SITE_URL` | Yes | — | Full URL with scheme: `https://example.com` |
| `DOMAIN` | No | — | Bare domain: `example.com` (shown in DNS panel) |

### Generating secrets

```bash
# On Linux/Mac — run three times for the three secrets
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# or
openssl rand -hex 32
```

Never reuse secrets across environments. Never share them in chat, email, or git commits.

---

## 3. Option A — Cheap Node.js app hosting (Railway, Render, Fly.io)

### 3a. Railway

Railway gives you a Linux container with persistent volumes and automatic deploys from git.

**Prerequisites:** Railway account, GitHub repo with the MyCMS source.

**Steps:**

1. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo** → select your repo.

2. Railway auto-detects `package.json` and runs `bun install && bun start`. Add a `start` script if missing:

   ```json
   // package.json
   "scripts": {
     "start": "NODE_ENV=production bun src/index.js",
     "dev":   "bun --watch src/index.js"
   }
   ```

3. Add a **Volume** for persistent storage:
   - Railway Dashboard → your service → **Volumes → Add Volume**
   - Mount path: `/data`

4. Set environment variables in the Railway dashboard (Variables tab):
   ```
   NODE_ENV=production
   SESSION_SECRET=<random-64-char-hex>
   HMAC_SECRET=<random-64-char-hex>
   CSRF_SECRET=<random-64-char-hex>
   DB_PATH=/data/cms.db
   UPLOAD_PATH=/data/uploads
   SITE_URL=https://your-project.up.railway.app
   ```

5. Click **Deploy**. Railway builds and starts the container. First visit goes to `/admin/setup`.

6. Add a custom domain: Dashboard → Settings → Networking → **Custom Domain** → add your domain and update your DNS A record.

---

### 3b. Render

Render offers a free "Web Service" tier and paid tiers with persistent disks.

> **Warning:** The free tier has no persistent disk — the SQLite database and uploads are wiped on every deploy. Use a paid tier ($7/mo) with a Disk, or the database will be reset every time you push code.

**Steps:**

1. Push your code to GitHub.

2. [render.com](https://render.com) → **New Web Service** → connect your repo.

3. Configure:
   - **Environment:** Node
   - **Build Command:** `bun install`
   - **Start Command:** `NODE_ENV=production bun src/index.js`
   - **Instance Type:** Starter ($7/mo) or higher for a persistent disk

4. Add a **Disk** (paid plans only):
   - Dashboard → your service → **Disks → Add Disk**
   - Mount path: `/data`
   - Size: 1 GB is enough to start

5. Add environment variables (same set as Railway above).

6. Click **Create Web Service**. First visit goes to `/admin/setup`.

---

### 3c. Fly.io

Fly deploys Docker containers globally. It has a generous free tier (3 shared-CPU VMs free).

**Prerequisites:** [Fly CLI installed](https://fly.io/docs/hands-on/install-flyctl/), `flyctl auth login`.

1. Create a `Dockerfile` in your project root:

   ```dockerfile
   FROM oven/bun:1-alpine AS base
   WORKDIR /app
   COPY package.json bun.lock* ./
   RUN bun install --frozen-lockfile
   COPY . .
   
   EXPOSE 8080
   ENV NODE_ENV=production
   CMD ["bun", "src/index.js"]
   ```

2. Launch the app:

   ```bash
   flyctl launch
   # Accept the generated fly.toml, do NOT deploy yet
   ```

3. Edit `fly.toml` to mount a volume:

   ```toml
   [mounts]
     source      = "cms_data"
     destination = "/data"
   ```

4. Create the volume:

   ```bash
   flyctl volumes create cms_data --size 1
   ```

5. Set secrets (never put these in fly.toml):

   ```bash
   flyctl secrets set \
     SESSION_SECRET=$(openssl rand -hex 32) \
     HMAC_SECRET=$(openssl rand -hex 32) \
     CSRF_SECRET=$(openssl rand -hex 32) \
     DB_PATH=/data/cms.db \
     UPLOAD_PATH=/data/uploads \
     SITE_URL=https://your-app.fly.dev
   ```

6. Deploy:

   ```bash
   flyctl deploy
   ```

7. Open the app:

   ```bash
   flyctl open
   ```

---

## 4. Option B — VPS with Bun/Node + Nginx

This is the recommended option for production sites with a custom domain. It gives you full control and the best performance.

**Tested on:** Ubuntu 22.04 / Debian 12. Commands assume a non-root user with `sudo`.

### Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc   # or ~/.zshrc
bun --version      # verify
```

### Or use Node.js 18+

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version
```

### Clone and install

```bash
sudo mkdir -p /srv/cms
sudo chown $USER:$USER /srv/cms
git clone https://github.com/your-org/buncms.git /srv/cms
cd /srv/cms
bun install   # or: npm install
```

### Create the production env file

```bash
cp .env.development .env
nano .env
```

Set the values:

```
NODE_ENV=production
PORT=8080
SESSION_SECRET=<random-hex>
HMAC_SECRET=<random-hex>
CSRF_SECRET=<random-hex>
DB_PATH=/srv/cms/data/cms.db
UPLOAD_PATH=/srv/cms/data/uploads
SITE_URL=https://example.com
DOMAIN=example.com
```

### Create data directories

```bash
mkdir -p /srv/cms/data/uploads
chmod 750 /srv/cms/data
```

### Test the server

```bash
cd /srv/cms
NODE_ENV=production bun src/index.js
# or: node src/index.js
```

Open `http://your-ip:8080` — you should see the site. Stop with Ctrl+C.

Proceed to [Section 9 (systemd)](#9-systemd-service-vps-only) to run it as a background service, then [Section 7 (Nginx)](#7-nginx-reverse-proxy-config) to put it behind a reverse proxy on port 80/443.

---

## 5. Option C — Single binary (no runtime needed)

Build a self-contained binary that includes Bun and all dependencies. Copy it to any Linux server and run it — no Bun or Node.js installation needed.

### Build

```bash
cd /your/dev/machine/buncms
NODE_ENV=production bun run build
# Output: ./mycms  (~15–20 MB)
```

The `build` script in `package.json` should be:

```json
"build": "bun build src/index.js --compile --outfile mycms"
```

### Deploy

```bash
# Copy to server
scp mycms user@yourserver:/srv/cms/mycms
scp -r themes/ user@yourserver:/srv/cms/themes/
scp -r plugins/ user@yourserver:/srv/cms/plugins/   # if you have plugins

# On the server
ssh user@yourserver
chmod +x /srv/cms/mycms
mkdir -p /srv/cms/data/uploads
```

### Run

```bash
cd /srv/cms
NODE_ENV=production \
SESSION_SECRET=<hex> \
HMAC_SECRET=<hex> \
CSRF_SECRET=<hex> \
DB_PATH=/srv/cms/data/cms.db \
UPLOAD_PATH=/srv/cms/data/uploads \
SITE_URL=https://example.com \
./mycms
```

Or set the variables in a `.env` file in the same directory — MyCMS reads it automatically via `config.js`.

> **Binary limitations:** The binary bundles `src/` but not `themes/` or `plugins/`. Those directories must sit alongside the binary and be readable at runtime. Use a fixed path like `/srv/cms/themes/` and ensure the binary's working directory is `/srv/cms`.

---

## 6. Persistent storage — the critical detail for cloud hosting

MyCMS stores everything that matters in two places:

| What | Default path | Contains |
|------|-------------|---------|
| **SQLite database** | `./data/cms.db` | All pages, posts, users, settings, permissions |
| **Uploads directory** | `./data/uploads/` | All uploaded images and PDFs |

If these paths are on an **ephemeral filesystem** (the default on Render free tier, Heroku, and some Railway configurations), **they are deleted on every deploy or restart**. The site will reset to first-run setup with no content.

### How to check if your platform is ephemeral

- **Railway:** ephemeral by default — add a Volume as described in Section 3a.
- **Render:** free tier is ephemeral — paid Starter adds a Disk.
- **Fly.io:** ephemeral by default — add a `[mounts]` volume as in Section 3c.
- **Heroku:** ephemeral — SQLite is not suitable; use a remote database add-on instead (not supported out of the box in MyCMS v1).
- **VPS:** persistent — the filesystem persists across restarts.
- **Binary on shared host:** persistent if the host is a real server, not a container.

### Making storage persistent on cloud platforms

The standard approach is to mount a persistent volume at `/data` and set:

```
DB_PATH=/data/cms.db
UPLOAD_PATH=/data/uploads
```

Every platform in Section 3 has a Volumes/Disk section. Once the volume is attached, the database and uploads survive deploys and restarts.

---

## 7. Nginx reverse proxy config

Nginx sits in front of MyCMS, handling SSL termination, compression, and serving uploads as static files for better performance.

Install Nginx:

```bash
sudo apt-get install -y nginx
```

Create a site config:

```bash
sudo nano /etc/nginx/sites-available/mycms
```

```nginx
server {
    listen 80;
    server_name example.com www.example.com;

    # Redirect www to non-www (optional)
    if ($host = www.example.com) {
        return 301 https://example.com$request_uri;
    }

    # Let's Encrypt challenge directory
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Redirect all HTTP to HTTPS once you have a cert
    location / {
        return 301 https://example.com$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # Serve uploaded files directly through Nginx (faster than going through Node)
    location /uploads/ {
        alias /srv/cms/data/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Serve theme assets directly
    location /assets/ {
        root /srv/cms/themes/default;
        expires 7d;
        add_header Cache-Control "public";
    }

    # Proxy everything else to the CMS
    location / {
        proxy_pass         http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";

        # File uploads — increase if users upload large files
        client_max_body_size 20M;

        # Timeouts
        proxy_read_timeout  60s;
        proxy_send_timeout  60s;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/mycms /etc/nginx/sites-enabled/
sudo nginx -t    # test the config
sudo systemctl reload nginx
```

> The `X-Real-IP` header is what MyCMS uses for rate limiting. Without it, all requests appear to come from `127.0.0.1` and a single bad actor could lock out everyone.

---

## 8. SSL with Let's Encrypt

Install Certbot:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
```

Obtain a certificate:

```bash
sudo certbot --nginx -d example.com -d www.example.com
```

Certbot modifies the Nginx config automatically and sets up auto-renewal. Verify renewal works:

```bash
sudo certbot renew --dry-run
```

Renewal is handled by a systemd timer or cron job installed automatically by Certbot. No further setup needed.

---

## 9. systemd service (VPS only)

A systemd service keeps MyCMS running in the background, starts it on boot, and restarts it if it crashes.

Create the service file:

```bash
sudo nano /etc/systemd/system/mycms.service
```

```ini
[Unit]
Description=MyCMS
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/srv/cms

# All secrets as environment variables — keeps them out of the code
Environment=NODE_ENV=production
Environment=PORT=8080
Environment=DB_PATH=/srv/cms/data/cms.db
Environment=UPLOAD_PATH=/srv/cms/data/uploads
Environment=SITE_URL=https://example.com
Environment=DOMAIN=example.com

# Secrets — replace with your actual values
Environment=SESSION_SECRET=replace-with-your-secret
Environment=HMAC_SECRET=replace-with-your-secret
Environment=CSRF_SECRET=replace-with-your-secret

# Use bun if installed for the service user; otherwise use node
ExecStart=/home/YOUR_USER/.bun/bin/bun src/index.js
# Or for the binary:
# ExecStart=/srv/cms/mycms

Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=mycms

[Install]
WantedBy=multi-user.target
```

Fix ownership and permissions:

```bash
sudo chown -R www-data:www-data /srv/cms/data
sudo chown -R www-data:www-data /srv/cms/themes
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable mycms
sudo systemctl start mycms
sudo systemctl status mycms
```

View logs:

```bash
sudo journalctl -u mycms -f          # live tail
sudo journalctl -u mycms --since today
```

---

## 10. Backups

### What to back up

| Item | Where | Frequency |
|------|-------|-----------|
| SQLite database | `$DB_PATH` (`cms.db`) | Daily |
| Uploads directory | `$UPLOAD_PATH` | Daily or on change |
| Secrets / environment variables | Secure vault or password manager | Once, update on rotation |

Themes and plugins are in git — don't back them up separately.

### Simple daily backup with cron

```bash
sudo nano /etc/cron.d/mycms-backup
```

```cron
# Back up MyCMS database and uploads daily at 2 AM
0 2 * * * www-data /usr/local/bin/mycms-backup.sh >> /var/log/mycms-backup.log 2>&1
```

Create the backup script:

```bash
sudo nano /usr/local/bin/mycms-backup.sh
sudo chmod +x /usr/local/bin/mycms-backup.sh
```

```bash
#!/bin/bash
set -e

BACKUP_DIR=/srv/cms/backups
DB_PATH=/srv/cms/data/cms.db
UPLOADS_PATH=/srv/cms/data/uploads
DATE=$(date +%Y-%m-%d)
KEEP_DAYS=14

mkdir -p "$BACKUP_DIR"

# SQLite hot backup — safe to run while the server is running
sqlite3 "$DB_PATH" ".backup $BACKUP_DIR/cms-$DATE.db"

# Tar the uploads directory
tar -czf "$BACKUP_DIR/uploads-$DATE.tar.gz" -C "$(dirname $UPLOADS_PATH)" uploads

# Delete backups older than KEEP_DAYS days
find "$BACKUP_DIR" -name "cms-*.db" -mtime +$KEEP_DAYS -delete
find "$BACKUP_DIR" -name "uploads-*.tar.gz" -mtime +$KEEP_DAYS -delete

echo "[$DATE] Backup complete."
```

### Offsite backup (optional but recommended)

Copy the backup files to S3, Backblaze B2, or another server using `rclone` or `aws s3 cp`. Add the copy step to the script above:

```bash
# Add to mycms-backup.sh:
rclone copy "$BACKUP_DIR/cms-$DATE.db" remote:mybucket/cms-backups/
rclone copy "$BACKUP_DIR/uploads-$DATE.tar.gz" remote:mybucket/cms-backups/
```

---

## 11. Monitoring and logs

### Application logs

On VPS with systemd:

```bash
sudo journalctl -u mycms -f                  # follow live
sudo journalctl -u mycms --since "1 hour ago"
```

In production mode MyCMS does not log individual requests by default (`logRequests: false` in `config/production.js`). Enable it temporarily for debugging by setting `NODE_ENV=development` or editing `config/production.js`.

### Nginx access and error logs

```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Health check endpoint

MyCMS does not ship a `/health` endpoint out of the box. The simplest health check is:

```bash
curl -fs http://127.0.0.1:8080/ > /dev/null && echo OK || echo DOWN
```

Add this to a cron job that sends you a notification if it fails, or use an uptime monitor like UptimeRobot (free tier) to ping your domain every 5 minutes.

### Disk usage

Watch for the uploads directory growing unbounded:

```bash
du -sh /srv/cms/data/uploads/
```

---

## 12. Updating MyCMS

### From source (VPS)

```bash
cd /srv/cms
git pull
bun install           # install any new dependencies
sudo systemctl restart mycms
```

### Binary update

Build a new binary on your development machine:

```bash
NODE_ENV=production bun run build
scp mycms user@yourserver:/srv/cms/mycms.new

# On the server
sudo systemctl stop mycms
mv /srv/cms/mycms.new /srv/cms/mycms
chmod +x /srv/cms/mycms
sudo systemctl start mycms
```

### Railway / Render / Fly

Push a new commit to the connected git branch. The platform rebuilds and restarts the container automatically. The persistent volume is not affected — your database and uploads survive the deploy.

### Database migrations

MyCMS uses `initDB()` which runs at every startup and adds new tables or columns only if they don't already exist. There are no manual migration steps needed between patch versions. If a minor or major version adds a breaking schema change, it will be documented in the changelog.

---

## 13. FAQ

**Q: The site loads but the admin panel returns 404 after deploy.**  
A: The `NODE_ENV` environment variable may not be set to `production`. The public router and admin router both depend on config values loaded via `src/config.js`. Double-check your environment variables.

**Q: Uploads show 404 after a redeploy on Railway/Render.**  
A: Your volume was not mounted or the `UPLOAD_PATH` env var doesn't point to the mounted path. Check that `UPLOAD_PATH=/data/uploads` (or wherever you mounted the volume) is set, and that the volume is attached in the dashboard.

**Q: I see "rate limit hit" errors for all users.**  
A: Without the `X-Real-IP` or `X-Forwarded-For` header from Nginx, all requests appear to come from the same IP (`127.0.0.1`). Confirm your Nginx config includes `proxy_set_header X-Real-IP $remote_addr;`.

**Q: The SQLite database is locked / the server crashes under load.**  
A: SQLite handles concurrent reads well but serializes writes. MyCMS is designed for single-server use. If you need to handle very high write concurrency, look into WAL mode — enable it with `PRAGMA journal_mode=WAL;` run once on the database file.

**Q: How do I reset the admin password on the server?**  
A: SSH into the server and run:

```bash
cd /srv/cms
DB_PATH=/srv/cms/data/cms.db bun -e "
  import { initDB, getDB } from './src/db.js';
  await initDB();
  const { hashPassword } = await import('./src/core/auth.js');
  const hash = await hashPassword('new-password-here');
  getDB().prepare(\"UPDATE users SET password_hash = ? WHERE username = 'admin'\").run(hash);
  console.log('Password reset.');
"
```

**Q: Can I run two sites on one server?**  
A: Yes. Clone the repo to a second directory (e.g., `/srv/cms2`), use a different port (`PORT=8081`), a different database path, and a different uploads path. Create a second systemd service and a second Nginx server block. Point a second domain at the same server IP, and Nginx routes traffic to the correct backend by hostname.

**Q: How do I enable HTTPS on a cheap shared host that has Node.js but no root access?**  
A: If you can't install Nginx or Certbot, use a service like **Cloudflare** as a reverse proxy — it provides free SSL termination in front of your origin server. Set your domain's nameservers to Cloudflare, enable the proxy (orange cloud), and Cloudflare handles HTTPS while talking to your server on HTTP. No server-side SSL config needed.

**Q: My platform only supports `node`, not `bun`. Will MyCMS run?**  
A: Yes. MyCMS runs on Node.js 18+. Change the start command from `bun src/index.js` to `node src/index.js`. There is one exception: the binary build (`bun build --compile`) requires Bun. For Node.js-only hosts, run from source.
