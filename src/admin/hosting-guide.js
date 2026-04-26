// src/admin/hosting-guide.js — beginner-friendly hosting setup wizard
import { adminHTML } from "./base.js";
import { requireAuth } from "../core/auth.js";

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── Platform definitions ──────────────────────────────────────────────────────

const PLATFORMS = [
  {
    id: "railway",
    name: "Railway",
    emoji: "🚂",
    tagline: "Go live in under 5 minutes",
    badge: "⭐ Easiest",
    badgeColor: "#f59e0b",
    difficulty: "Beginner",
    cost: "Free to start",
    dbOptions: "MySQL add-on or SQLite with a disk",
  },
  {
    id: "render",
    name: "Render",
    emoji: "🎛️",
    tagline: "Free tier with GitHub auto-deploy",
    badge: "Free tier",
    badgeColor: "#6366f1",
    difficulty: "Beginner",
    cost: "Free tier available",
    dbOptions: "PostgreSQL add-on (free) or SQLite with a disk",
  },
  {
    id: "flyio",
    name: "Fly.io",
    emoji: "✈️",
    tagline: "Fast global deployment",
    difficulty: "Intermediate",
    cost: "Pay-as-you-go, ~$2–5/mo",
    dbOptions: "Fly volumes for SQLite or external MySQL",
  },
  {
    id: "coolify",
    name: "Coolify",
    emoji: "🐙",
    tagline: "Self-hosted on your own server",
    difficulty: "Intermediate",
    cost: "Free + server cost",
    dbOptions: "MySQL service included in Coolify",
  },
  {
    id: "vps",
    name: "VPS / Linux Server",
    emoji: "🖥️",
    tagline: "DigitalOcean, Hetzner, Linode…",
    difficulty: "Intermediate",
    cost: "$4–10/month",
    dbOptions: "SQLite (simple) or install MySQL",
  },
  {
    id: "cpanel",
    name: "cPanel Hosting",
    emoji: "🌐",
    tagline: "Shared hosting with cPanel panel",
    difficulty: "Intermediate",
    cost: "Varies by host",
    dbOptions: "MySQL via cPanel",
  },
];

// ─── UI helpers ────────────────────────────────────────────────────────────────

// Copy button reads from its previous sibling <code> at click time — no hardcoded value
function copyBtn(label = "Copy") {
  return `<button type="button" onclick="copyText(this.previousElementSibling.textContent, this)"
    style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;color:#334155;white-space:nowrap">
    📋 ${esc(label)}
  </button>`;
}

function linkBtn(url, label) {
  return `<a href="${esc(url)}" target="_blank" rel="noopener"
    style="display:inline-flex;align-items:center;gap:6px;padding:8px 18px;background:#154d37;color:white;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none">
    ${esc(label)} ↗
  </a>`;
}

function codeBlock(cmd) {
  return `<div style="display:flex;align-items:center;gap:10px;background:#1e293b;border-radius:10px;padding:12px 16px;margin:8px 0">
    <code style="flex:1;color:#e2e8f0;font-size:13px;font-family:monospace;word-break:break-all">${esc(cmd)}</code>
    ${copyBtn("Copy")}
  </div>`;
}

// Copyable row — shows generated/fixed value with a Copy button
function envRow(key, value, note = "") {
  return `<tr>
    <td style="padding:10px 12px;font-family:monospace;font-size:13px;font-weight:600;color:#0f172a;white-space:nowrap">${esc(key)}</td>
    <td style="padding:10px 12px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <code data-env="${esc(key)}" style="background:#f1f5f9;padding:4px 10px;border-radius:6px;font-size:12px;color:#334155;word-break:break-all">${esc(value)}</code>
        ${copyBtn("Copy")}
      </div>
      ${note ? `<div style="font-size:12px;color:#94a3b8;margin-top:4px">${note}</div>` : ""}
    </td>
  </tr>`;
}

// Fill-in row — shows a placeholder the user must replace; NO copy button
function fillRow(key, placeholder, note = "") {
  return `<tr>
    <td style="padding:10px 12px;font-family:monospace;font-size:13px;font-weight:600;color:#0f172a;white-space:nowrap">${esc(key)}</td>
    <td style="padding:10px 12px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <code style="background:#fef9c3;padding:4px 10px;border-radius:6px;font-size:12px;color:#92400e;font-style:italic">${esc(placeholder)}</code>
        <span style="font-size:11px;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:20px;font-weight:600">✏ fill in</span>
      </div>
      ${note ? `<div style="font-size:12px;color:#94a3b8;margin-top:4px">${note}</div>` : ""}
    </td>
  </tr>`;
}

function envTable(rows) {
  return `<div style="overflow-x:auto;margin:12px 0">
    <table style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
      <thead><tr style="background:#f1f5f9">
        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;letter-spacing:.06em">VARIABLE</th>
        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;letter-spacing:.06em">VALUE</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function step(num, emoji, title, body) {
  return `
  <div class="guide-step" id="step-${num}" style="display:flex;gap:16px;margin-bottom:24px">
    <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:6px">
      <label style="cursor:pointer;display:flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:50%;background:#f1f5f9;border:2px solid #e2e8f0;font-size:18px;transition:all .2s;flex-shrink:0">
        <input type="checkbox" class="step-check" data-step="${num}"
          style="position:absolute;opacity:0;pointer-events:none">
        <span class="step-icon">${emoji}</span>
      </label>
      ${num < 99 ? `<div style="width:2px;flex:1;min-height:20px;background:#e2e8f0;border-radius:2px"></div>` : ""}
    </div>
    <div style="flex:1;padding-bottom:8px">
      <h3 style="margin:8px 0 12px;font-size:16px;color:#0f172a">${esc(title)}</h3>
      <div style="font-size:14px;color:#334155;line-height:1.7">${body}</div>
    </div>
  </div>`;
}

// ─── Per-platform guides ───────────────────────────────────────────────────────

function railwayGuide() {
  return [
    step(1, "💻", "Put your code on GitHub",
      `<p>Railway deploys directly from GitHub, so your code needs to be there first.</p>
       <p style="margin:10px 0">If you haven't done this yet, run these commands in your project folder:</p>
       ${codeBlock("git init")}
       ${codeBlock("git add .")}
       ${codeBlock('git commit -m "Initial commit"')}
       <p style="margin:10px 0">Then create a new repository on GitHub and push your code there:</p>
       ${linkBtn("https://github.com/new", "Create GitHub repo")}
       <p style="margin:10px 0;font-size:13px;color:#64748b">After creating the repo, GitHub will show you the exact commands to push — follow those.</p>`
    ),
    step(2, "🚂", "Create a free Railway account",
      `<p>Railway is where your website will live. Sign up with your GitHub account so they can see your code.</p>
       <div style="margin:12px 0">${linkBtn("https://railway.app", "Open Railway →")}</div>
       <p style="margin-top:12px;font-size:13px;color:#64748b">Click "Login with GitHub" — it's free to start, no credit card needed.</p>`
    ),
    step(3, "🔗", "Deploy your project",
      `<p>Inside Railway:</p>
       <ol style="margin:10px 0;padding-left:20px;line-height:2">
         <li>Click <strong>New Project</strong></li>
         <li>Click <strong>Deploy from GitHub repo</strong></li>
         <li>Select your repository from the list</li>
         <li>Railway will detect Bun automatically and start deploying</li>
       </ol>
       <p style="font-size:13px;color:#64748b">The first deploy may take 1–2 minutes. You'll see a green ✓ when it's done.</p>`
    ),
    step(4, "🔑", "Add your secret keys",
      `<p>These keys keep your site secure. <strong>Copy each value below into Railway's Variables tab.</strong></p>
       <p style="margin:10px 0">In Railway: click your project → <strong>Variables</strong> tab → add each of these:</p>
       ${envTable(
         envRow("SESSION_SECRET", "GENERATED_ON_PAGE_LOAD", "Signs your login sessions") +
         envRow("HMAC_SECRET",    "GENERATED_ON_PAGE_LOAD", "Signs content integrity") +
         envRow("CSRF_SECRET",    "GENERATED_ON_PAGE_LOAD", "Prevents form attacks")
       )}
       <p style="font-size:13px;color:#64748b;margin-top:8px">👆 Fresh random values generated just for you. Copy each one — they're unique every time you open this page.</p>`
    ),
    step(5, "🗄️", "Set up your database",
      `<p>Choose one of these options:</p>
       <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0">
         <div style="padding:14px;border:2px solid #86efac;border-radius:12px;background:#f0fdf4">
           <div style="font-weight:700;margin-bottom:6px">SQLite (Simpler)</div>
           <div style="font-size:13px;color:#64748b;margin-bottom:10px">Good for small sites. Add a Volume so your data persists.</div>
           <div style="font-size:13px">In Railway: click <strong>+ New</strong> → <strong>Volume</strong> → mount at <code>/data</code></div>
           ${envTable(envRow("DB_PATH", "/data/cms.db", "Where SQLite stores your data"))}
         </div>
         <div style="padding:14px;border:2px solid #e2e8f0;border-radius:12px">
           <div style="font-weight:700;margin-bottom:6px">MySQL (Scalable)</div>
           <div style="font-size:13px;color:#64748b;margin-bottom:10px">For larger sites. Railway provides a managed MySQL service.</div>
           <div style="font-size:13px">In Railway: click <strong>+ New</strong> → <strong>Database</strong> → <strong>MySQL</strong><br>Then copy the connection details into your Variables.</div>
         </div>
       </div>`
    ),
    step(6, "🌐", "Get your site's URL",
      `<p>In Railway: go to your project → <strong>Settings</strong> → <strong>Networking</strong> → <strong>Generate Domain</strong></p>
       <p style="margin:10px 0">You'll get a URL like <code>yoursite.up.railway.app</code>. Add it as a variable:</p>
       ${envTable(fillRow("SITE_URL", "https://yoursite.up.railway.app", "Paste your actual Railway domain here"))}
       <p style="font-size:13px;color:#64748b;margin-top:8px">Later you can connect a custom domain (like yourname.com) in the same Settings panel.</p>`
    ),
    step(7, "🎉", "You're live!",
      `<p>Railway redeploys automatically every time you push code to GitHub.</p>
       <p style="margin:10px 0">Visit your site URL to see it live. Go to <strong>/admin</strong> to log in and start editing.</p>
       <p style="font-size:13px;color:#64748b">If anything looks wrong, click <strong>Deployments</strong> → your latest deploy → <strong>View Logs</strong> to see what happened.</p>`
    ),
  ].join("");
}

function renderGuide() {
  return [
    step(1, "💻", "Push your code to GitHub",
      `<p>Render deploys from GitHub. Run these in your project folder if you haven't already:</p>
       ${codeBlock("git init && git add . && git commit -m 'Initial commit'")}
       ${linkBtn("https://github.com/new", "Create GitHub repo →")}`
    ),
    step(2, "🎛️", "Create a Render account",
      `<p>Sign up at Render — free tier available, no credit card required.</p>
       ${linkBtn("https://render.com", "Open Render →")}`
    ),
    step(3, "🔗", "Create a Web Service",
      `<p>In Render: click <strong>New +</strong> → <strong>Web Service</strong> → connect your GitHub repo.</p>
       <p style="margin:10px 0">Set these build settings:</p>
       ${envTable(
         envRow("Runtime", "Node") +
         envRow("Build Command", "(leave empty)") +
         envRow("Start Command", "bun src/index.js")
       )}`
    ),
    step(4, "🔑", "Add environment variables",
      `<p>In Render: scroll down to <strong>Environment Variables</strong> and add:</p>
       ${envTable(
         envRow("SESSION_SECRET", "GENERATED_ON_PAGE_LOAD") +
         envRow("HMAC_SECRET",    "GENERATED_ON_PAGE_LOAD") +
         envRow("CSRF_SECRET",    "GENERATED_ON_PAGE_LOAD") +
         fillRow("SITE_URL", "https://yoursite.onrender.com", "Paste your Render URL after deployment")
       )}`
    ),
    step(5, "💾", "Add a disk for file storage",
      `<p>In Render: scroll to <strong>Disks</strong> → <strong>Add Disk</strong>.</p>
       <p style="margin:10px 0">Set mount path to <code>/data</code>, then add:</p>
       ${envTable(envRow("DB_PATH", "/data/cms.db") + envRow("UPLOAD_PATH", "/data/uploads"))}`
    ),
    step(6, "🎉", "Deploy!",
      `<p>Click <strong>Create Web Service</strong>. Render will build and deploy your site automatically.</p>
       <p style="margin:10px 0;font-size:13px;color:#64748b">Free tier services spin down after 15 minutes of inactivity — the first visit may take ~30 seconds to wake up. Upgrade to a paid plan to avoid this.</p>`
    ),
  ].join("");
}

function flyioGuide() {
  return [
    step(1, "🛠️", "Install the Fly.io CLI tool",
      `<p>Open your computer's terminal and run this command:</p>
       ${codeBlock("curl -L https://fly.io/install.sh | sh")}
       <p style="margin:10px 0;font-size:13px;color:#64748b">On Windows: <a href="https://fly.io/docs/hands-on/install-flyctl/" target="_blank" style="color:#154d37">follow the Windows instructions here</a></p>`
    ),
    step(2, "✈️", "Create a Fly.io account and log in",
      `${linkBtn("https://fly.io/app/sign-up", "Create Fly account →")}
       <p style="margin:12px 0">Then log in from your terminal:</p>
       ${codeBlock("fly auth login")}`
    ),
    step(3, "🚀", "Launch your app",
      `<p>In your project folder, run:</p>
       ${codeBlock("fly launch")}
       <p style="margin:10px 0;font-size:13px;color:#64748b">Fly will ask you a few questions — press Enter to accept the defaults. When it asks about databases, say Yes to add a volume for SQLite.</p>`
    ),
    step(4, "🔑", "Set your secret keys",
      `<p>Copy the generated values below, then run the commands — pasting each value where shown:</p>
       ${envTable(
         envRow("SESSION_SECRET", "GENERATED_ON_PAGE_LOAD") +
         envRow("HMAC_SECRET",    "GENERATED_ON_PAGE_LOAD") +
         envRow("CSRF_SECRET",    "GENERATED_ON_PAGE_LOAD")
       )}
       ${codeBlock("fly secrets set SESSION_SECRET=PASTE_SESSION_VALUE_HERE")}
       ${codeBlock("fly secrets set HMAC_SECRET=PASTE_HMAC_VALUE_HERE")}
       ${codeBlock("fly secrets set CSRF_SECRET=PASTE_CSRF_VALUE_HERE")}`
    ),
    step(5, "🌐", "Set your site URL",
      `<p>First get your app URL:</p>
       ${codeBlock("fly info")}
       <p style="margin:10px 0">Then set it (replace with your actual app name):</p>
       ${codeBlock("fly secrets set SITE_URL=https://YOUR-APP.fly.dev")}`
    ),
    step(6, "🎉", "Deploy!",
      `${codeBlock("fly deploy")}
       <p style="margin:8px 0;font-size:13px;color:#64748b">Your site is live. Run <code>fly open</code> to open it in your browser.</p>`
    ),
  ].join("");
}

function coolifyGuide() {
  return [
    step(1, "🖥️", "Get a Linux server",
      `<p>You need a server running Ubuntu 22.04 or newer. Get one from any of these providers — the cheapest plan works fine:</p>
       <div style="display:flex;gap:10px;flex-wrap:wrap;margin:12px 0">
         ${linkBtn("https://digitalocean.com", "DigitalOcean")}
         ${linkBtn("https://hetzner.com", "Hetzner (cheapest)")}
         ${linkBtn("https://linode.com", "Linode")}
       </div>
       <p style="font-size:13px;color:#64748b">Pick the smallest plan ($4–6/month). Make sure to select Ubuntu as the operating system.</p>`
    ),
    step(2, "🐙", "Install Coolify on your server",
      `<p>Connect to your server via SSH (the hosting provider gives you a Terminal/SSH button), then run:</p>
       ${codeBlock("curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash")}
       <p style="margin:10px 0;font-size:13px;color:#64748b">This takes about 5 minutes. When done, open <code>http://YOUR-SERVER-IP:8000</code> to see the Coolify panel.</p>`
    ),
    step(3, "🔗", "Add your GitHub repo in Coolify",
      `<p>In Coolify: click <strong>+ New Resource</strong> → <strong>Application</strong> → <strong>GitHub</strong> → connect your repo.</p>
       <p style="margin:10px 0">Set the start command to:</p>
       ${codeBlock("bun src/index.js")}`
    ),
    step(4, "🔑", "Set environment variables",
      `<p>In Coolify: go to your app → <strong>Environment Variables</strong> and add:</p>
       ${envTable(
         envRow("SESSION_SECRET", "GENERATED_ON_PAGE_LOAD") +
         envRow("HMAC_SECRET",    "GENERATED_ON_PAGE_LOAD") +
         envRow("CSRF_SECRET",    "GENERATED_ON_PAGE_LOAD") +
         fillRow("SITE_URL", "https://yourdomain.com", "Your actual domain name") +
         envRow("DB_PATH",        "/data/cms.db")
       )}`
    ),
    step(5, "💾", "Add persistent storage",
      `<p>In Coolify: go to your app → <strong>Storages</strong> → <strong>Add Storage</strong> → mount at <code>/data</code>.</p>
       <p style="font-size:13px;color:#64748b;margin-top:8px">This makes sure your database and uploaded files survive server restarts.</p>`
    ),
    step(6, "🎉", "Deploy and connect your domain",
      `<p>Click <strong>Deploy</strong>. Then in Coolify: <strong>Domains</strong> → add your domain name → Coolify handles SSL automatically.</p>`
    ),
  ].join("");
}

function vpsGuide() {
  return [
    step(1, "🖥️", "Get a Linux server",
      `<p>Any Ubuntu 22.04 server works. The cheapest plan is enough to start:</p>
       <div style="display:flex;gap:10px;flex-wrap:wrap;margin:12px 0">
         ${linkBtn("https://digitalocean.com", "DigitalOcean")}
         ${linkBtn("https://hetzner.com", "Hetzner")}
         ${linkBtn("https://linode.com", "Linode")}
       </div>`
    ),
    step(2, "🔧", "Install Bun on your server",
      `<p>Connect to your server via SSH, then run:</p>
       ${codeBlock("curl -fsSL https://bun.sh/install | bash")}
       ${codeBlock("source ~/.bashrc")}`
    ),
    step(3, "📂", "Upload your project files",
      `<p>From your local computer, copy your project to the server:</p>
       ${codeBlock("scp -r ./your-project root@YOUR-SERVER-IP:/var/www/cms")}
       <p style="margin:10px 0;font-size:13px;color:#64748b">Or use <code>git clone</code> on the server if your code is on GitHub.</p>`
    ),
    step(4, "🔑", "Create your .env file",
      `<p>On the server, in your project folder:</p>
       ${codeBlock("nano .env")}
       <p style="margin:10px 0">Paste this, replacing the highlighted values with yours:</p>
       <div style="background:#1e293b;border-radius:10px;padding:16px;margin:8px 0;font-family:monospace;font-size:13px;color:#e2e8f0;line-height:1.8">
         SITE_URL=<span style="color:#fde68a">https://yourdomain.com</span><br>
         SESSION_SECRET=<span id="vps-s1" style="color:#86efac">generating…</span><br>
         HMAC_SECRET=<span id="vps-s2" style="color:#86efac">generating…</span><br>
         CSRF_SECRET=<span id="vps-s3" style="color:#86efac">generating…</span><br>
         DB_PATH=/var/www/cms/data/cms.db
       </div>
       <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
         <button type="button" onclick="copyVpsEnv()" style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;color:#334155">📋 Copy full .env block</button>
       </div>
       <p style="font-size:13px;color:#64748b;margin-top:8px">Press Ctrl+X → Y → Enter to save after pasting.</p>`
    ),
    step(5, "⚙️", "Set up systemd (auto-restart on server reboot)",
      `<p>Create a service file:</p>
       ${codeBlock("nano /etc/systemd/system/cms.service")}
       <p style="margin:10px 0">Paste this:</p>
       <div style="background:#1e293b;border-radius:10px;padding:16px;margin:8px 0;font-family:monospace;font-size:13px;color:#e2e8f0;line-height:1.8">
         [Unit]<br>Description=Veave CMS<br>After=network.target<br><br>
         [Service]<br>WorkingDirectory=/var/www/cms<br>
         ExecStart=/root/.bun/bin/bun src/index.js<br>
         Restart=always<br>EnvironmentFile=/var/www/cms/.env<br><br>
         [Install]<br>WantedBy=multi-user.target
       </div>
       ${codeBlock("systemctl enable cms && systemctl start cms")}`
    ),
    step(6, "🌐", "Set up Nginx + free SSL",
      `${codeBlock("apt install nginx certbot python3-certbot-nginx -y")}
       ${codeBlock("certbot --nginx -d yourdomain.com")}
       <p style="margin:10px 0;font-size:13px;color:#64748b">Certbot sets up HTTPS automatically. Replace <code>yourdomain.com</code> with your actual domain.</p>`
    ),
    step(7, "🎉", "You're live!",
      `<p>Visit your domain. Log in at <code>/admin</code>. Your site auto-restarts if the server reboots.</p>`
    ),
  ].join("");
}

function cpanelGuide() {
  return [
    step(1, "📦", "Upload your files",
      `<p>Log in to cPanel → <strong>File Manager</strong> → navigate to <code>public_html</code> (or a subdirectory).</p>
       <p style="margin:10px 0">Upload your entire project folder there. You can use the <strong>Upload</strong> button or connect via FTP.</p>`
    ),
    step(2, "🟢", "Create a Node.js app",
      `<p>In cPanel → look for <strong>Node.js App</strong> or <strong>Setup Node.js App</strong> → click <strong>Create Application</strong>.</p>
       <ul style="margin:10px 0;padding-left:20px;line-height:2">
         <li>Node.js version: select the latest available</li>
         <li>Application mode: Production</li>
         <li>Application root: the folder you uploaded to</li>
         <li>Application startup file: <code>src/index.js</code></li>
       </ul>`
    ),
    step(3, "🗄️", "Create a MySQL database",
      `<p>In cPanel → <strong>MySQL Databases</strong>:</p>
       <ol style="margin:10px 0;padding-left:20px;line-height:2">
         <li>Create a new database (e.g. <code>mysite_cms</code>)</li>
         <li>Create a database user with a strong password</li>
         <li>Add the user to the database with <strong>All Privileges</strong></li>
       </ol>
       <p style="font-size:13px;color:#64748b">Write down the database name, username, and password — you'll need them in the next step.</p>`
    ),
    step(4, "🔑", "Set environment variables",
      `<p>In the Node.js App settings → <strong>Environment Variables</strong> section.</p>
       <p style="margin:8px 0 4px">Copy these generated secrets — then fill in your own values for the yellow rows:</p>
       ${envTable(
         envRow("SESSION_SECRET", "GENERATED_ON_PAGE_LOAD", "Auto-generated — click Copy") +
         envRow("HMAC_SECRET",    "GENERATED_ON_PAGE_LOAD", "Auto-generated — click Copy") +
         envRow("CSRF_SECRET",    "GENERATED_ON_PAGE_LOAD", "Auto-generated — click Copy") +
         fillRow("SITE_URL",      "https://yourdomain.com",  "Your actual domain with https://") +
         envRow("DB_HOST",        "localhost") +
         fillRow("DB_NAME",       "mysite_cms",              "The database name you created in step 3") +
         fillRow("DB_USER",       "your_db_username",        "The database user you created in step 3") +
         fillRow("DB_PASSWORD",   "your_db_password",        "The password you set in step 3")
       )}`
    ),
    step(5, "🚀", "Start your app",
      `<p>In the Node.js App panel → click <strong>Run NPM Install</strong>, then click <strong>Start</strong> (or Restart).</p>
       <p style="margin:10px 0;font-size:13px;color:#64748b">If your host doesn't have a Node.js App section, contact their support — they may need to enable it for your account.</p>`
    ),
    step(6, "🎉", "Done!",
      `<p>Visit your domain. Your site is live. Log in at <code>/admin</code>.</p>`
    ),
  ].join("");
}

const GUIDES = {
  railway: railwayGuide,
  render:  renderGuide,
  flyio:   flyioGuide,
  coolify: coolifyGuide,
  vps:     vpsGuide,
  cpanel:  cpanelGuide,
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export const hostingGuidePage = requireAuth(async (req, params, session) => {
  const url = new URL(req.url);
  const selected = url.searchParams.get("platform") || "";
  const platform = PLATFORMS.find(p => p.id === selected);

  const platformCards = PLATFORMS.map(p => {
    const isSelected = p.id === selected;
    return `
      <a href="/admin/hosting?platform=${p.id}"
        style="display:block;padding:16px 18px;border-radius:14px;border:2px solid ${isSelected ? "#154d37" : "#e2e8f0"};
          background:${isSelected ? "#f0fdf4" : "white"};text-decoration:none;transition:all .15s;cursor:pointer">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:22px">${p.emoji}</span>
          ${p.badge ? `<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;background:${p.badgeColor || "#f1f5f9"};color:${p.badgeColor ? "white" : "#334155"}">${p.badge}</span>` : ""}
        </div>
        <div style="font-weight:700;font-size:15px;color:#0f172a;margin-bottom:3px">${esc(p.name)}</div>
        <div style="font-size:12px;color:#64748b;margin-bottom:8px">${esc(p.tagline)}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <span style="font-size:11px;background:#f1f5f9;padding:2px 8px;border-radius:20px;color:#475569">${esc(p.difficulty)}</span>
          <span style="font-size:11px;background:#f1f5f9;padding:2px 8px;border-radius:20px;color:#475569">${esc(p.cost)}</span>
        </div>
      </a>`;
  }).join("");

  const guideContent = platform && GUIDES[platform.id]
    ? `<div style="margin-bottom:20px;display:flex;align-items:center;gap:12px">
         <span style="font-size:32px">${platform.emoji}</span>
         <div>
           <h2 style="margin:0">${esc(platform.name)}</h2>
           <div style="color:#64748b;font-size:14px;margin-top:2px">${esc(platform.tagline)}</div>
         </div>
         <a href="/admin/hosting" style="margin-left:auto;font-size:13px;color:#94a3b8;text-decoration:none;white-space:nowrap">← Pick different platform</a>
       </div>
       <div style="background:#e0f2fe;color:#0369a1;border-radius:12px;padding:12px 16px;margin-bottom:24px;font-size:13px">
         ✅ Check off each step as you go — your progress is saved in your browser.
         &nbsp;|&nbsp; <strong>Green rows</strong> = click Copy. &nbsp;<strong>Yellow rows</strong> = fill in your own value.
       </div>
       ${GUIDES[platform.id]()}`
    : `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:300px;color:#94a3b8;text-align:center">
         <div style="font-size:48px;margin-bottom:16px">👈</div>
         <h3 style="margin-bottom:8px;color:#334155">Pick your hosting platform</h3>
         <p style="font-size:14px">Choose where you want to publish your site and we'll walk you through every step.</p>
       </div>`;

  const body = `
    <div style="margin-bottom:24px">
      <h2 style="margin-bottom:4px">Hosting Setup Guide</h2>
      <p style="color:#64748b;font-size:14px">Pick your platform and follow the steps — no technical knowledge needed.</p>
    </div>

    <div style="display:grid;grid-template-columns:280px 1fr;gap:24px;align-items:start">
      <!-- Platform picker -->
      <div style="display:flex;flex-direction:column;gap:10px">
        ${platformCards}
        <div style="padding:12px;border-radius:12px;background:#fef9c3;border:1px solid #fde68a;font-size:12px;color:#92400e;margin-top:4px">
          💡 Not sure? Start with <strong>Railway</strong> — it's the easiest and has a free tier.
        </div>
      </div>

      <!-- Guide content -->
      <div class="card" style="min-height:300px">
        ${guideContent}
      </div>
    </div>

    <script>
      // Generate 3 distinct secrets on page load
      function gen() {
        const arr = new Uint8Array(32);
        crypto.getRandomValues(arr);
        return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
      }

      const S = [gen(), gen(), gen()]; // SESSION, HMAC, CSRF

      // Fill GENERATED_ON_PAGE_LOAD placeholders with the correct secret per key
      const SECRET_KEYS = ['SESSION_SECRET', 'HMAC_SECRET', 'CSRF_SECRET'];
      document.querySelectorAll('tr').forEach(tr => {
        const keyCell = tr.querySelector('td:first-child');
        if (!keyCell) return;
        const idx = SECRET_KEYS.indexOf(keyCell.textContent.trim());
        if (idx < 0) return;
        const code = tr.querySelector('code[data-env]');
        if (code && code.textContent.trim() === 'GENERATED_ON_PAGE_LOAD') {
          code.textContent = S[idx];
        }
      });

      // VPS inline spans
      const vs = [document.getElementById('vps-s1'), document.getElementById('vps-s2'), document.getElementById('vps-s3')];
      vs.forEach((el, i) => { if (el) el.textContent = S[i]; });

      // Copy helper — used by all copy buttons via this.previousElementSibling.textContent
      function copyText(text, btn) {
        navigator.clipboard.writeText(text).then(() => {
          const orig = btn.innerHTML;
          btn.innerHTML = '✓ Copied!';
          btn.style.color = '#16a34a';
          setTimeout(() => { btn.innerHTML = orig; btn.style.color = ''; }, 2000);
        });
      }
      window.copyText = copyText;

      // VPS — copy the full .env block (reads live secret spans)
      function copyVpsEnv() {
        const s1 = document.getElementById('vps-s1')?.textContent || S[0];
        const s2 = document.getElementById('vps-s2')?.textContent || S[1];
        const s3 = document.getElementById('vps-s3')?.textContent || S[2];
        const block = [
          'SITE_URL=https://yourdomain.com',
          'SESSION_SECRET=' + s1,
          'HMAC_SECRET=' + s2,
          'CSRF_SECRET=' + s3,
          'DB_PATH=/var/www/cms/data/cms.db',
        ].join('\\n');
        navigator.clipboard.writeText(block).then(() => {
          const btn = document.querySelector('[onclick="copyVpsEnv()"]');
          if (btn) { btn.innerHTML = '✓ Copied!'; setTimeout(() => btn.innerHTML = '📋 Copy full .env block', 2000); }
        });
      }
      window.copyVpsEnv = copyVpsEnv;

      // Step checklist — persisted in localStorage
      const platform = '${esc(selected)}';
      document.querySelectorAll('.step-check').forEach(cb => {
        const key = 'guide_' + platform + '_step_' + cb.dataset.step;
        if (localStorage.getItem(key) === '1') markDone(cb, true);
        cb.addEventListener('change', () => {
          localStorage.setItem(key, cb.checked ? '1' : '0');
          markDone(cb, cb.checked);
        });
      });

      function markDone(cb, done) {
        cb.checked = done;
        const label = cb.closest('label');
        const icon = label?.querySelector('.step-icon');
        if (label) { label.style.background = done ? '#154d37' : '#f1f5f9'; label.style.borderColor = done ? '#154d37' : '#e2e8f0'; }
        if (icon) icon.textContent = done ? '✓' : icon.dataset.orig || icon.textContent;
        const stepDiv = cb.closest('.guide-step');
        if (stepDiv) stepDiv.style.opacity = done ? '0.6' : '1';
      }
    </script>
  `;

  return new Response(adminHTML("Deploy Your Site", body, session), { headers: { "Content-Type": "text/html" } });
});
