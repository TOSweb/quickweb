// src/admin/env.js — UI for managing the .env file (superuser only)
import { adminHTML } from "./base.js";
import { requireAuth } from "../core/auth.js";
import { csrfProtect, generateCsrfToken } from "../core/csrf.js";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ENV_PATH = join(process.cwd(), ".env");

// All known env vars grouped into sections
const ENV_SCHEMA = [
  {
    group: "Site",
    vars: [
      { key: "PORT",     label: "Port",     placeholder: "8080",              help: "Port the server listens on" },
      { key: "SITE_URL", label: "Site URL", placeholder: "https://example.com", help: "Full public URL including https://" },
      { key: "DOMAIN",   label: "Domain",   placeholder: "example.com",       help: "Domain without protocol" },
    ],
  },
  {
    group: "Database — MySQL",
    help: "Set DB_HOST, DB_USER, and DB_NAME to auto-enable MySQL. Leave empty to use SQLite.",
    vars: [
      { key: "DB_HOST",      label: "Host",          placeholder: "localhost" },
      { key: "DB_PORT",      label: "Port",          placeholder: "3306" },
      { key: "DB_NAME",      label: "Database Name", placeholder: "buncms" },
      { key: "DB_USER",      label: "Username",      placeholder: "root" },
      { key: "DB_PASSWORD",  label: "Password",      secret: true },
      { key: "DB_POOL_SIZE", label: "Pool Size",     placeholder: "10" },
    ],
  },
  {
    group: "Database — SQLite",
    help: "Only used when MySQL is not configured.",
    vars: [
      { key: "DB_PATH", label: "File path", placeholder: "./data/cms.db" },
    ],
  },
  {
    group: "Security Keys",
    help: "Used to sign sessions, cookies, and HMAC tokens. Generate long random strings. Never share or expose these.",
    vars: [
      { key: "SESSION_SECRET", label: "Session Secret", secret: true, generate: true },
      { key: "HMAC_SECRET",    label: "HMAC Secret",    secret: true, generate: true },
      { key: "CSRF_SECRET",    label: "CSRF Secret",    secret: true, generate: true },
    ],
  },
  {
    group: "Storage",
    vars: [
      { key: "UPLOAD_PATH", label: "Upload directory", placeholder: "./data/uploads" },
    ],
  },
];

function parseEnv(content) {
  const vars = {};
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

function serializeEnv(vars) {
  const lines = [];
  for (const [k, v] of Object.entries(vars)) {
    if (v === null || v === undefined || v === "") continue;
    const needsQuote = /[\s#"'`$\\]/.test(v);
    const escaped = needsQuote ? `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : v;
    lines.push(`${k}=${escaped}`);
  }
  return lines.join("\n") + "\n";
}

function esc(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export const envPage = requireAuth(async (req, params, session) => {
  if (!session.isSuperuser) {
    return new Response(adminHTML("Access Denied", `
      <div class="card" style="text-align:center;padding:60px">
        <p style="font-size:48px;margin-bottom:16px">🔒</p>
        <h2 style="margin-bottom:8px">Superuser access required</h2>
        <p style="color:#64748b">Only superuser accounts can manage environment variables.</p>
      </div>
    `, session), { headers: { "Content-Type": "text/html" } });
  }

  const url = new URL(req.url);
  const saved = url.searchParams.get("saved") === "1";
  const existing = existsSync(ENV_PATH) ? parseEnv(readFileSync(ENV_PATH, "utf8")) : {};
  const csrfToken = generateCsrfToken(session.id);

  const card = (content) => `<div class="card" style="margin-bottom:16px">${content}</div>`;
  const lbl = (v) => `<label style="display:block;font-weight:600;font-size:13px;margin-bottom:6px">
    ${esc(v.label)} <code style="font-weight:400;color:#94a3b8;font-size:11px">${esc(v.key)}</code>
  </label>`;
  const inputStyle = `width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafb;font-family:monospace;font-size:14px`;

  const sections = ENV_SCHEMA.map(group => {
    const fields = group.vars.map(v => {
      const cur = existing[v.key] ?? "";
      const hasVal = cur.length > 0;

      if (v.secret) {
        const badge = hasVal
          ? `<span style="font-size:11px;font-weight:700;color:#16a34a;background:#f0fdf4;padding:2px 8px;border-radius:20px">● SET</span>`
          : `<span style="font-size:11px;font-weight:700;color:#dc2626;background:#fef2f2;padding:2px 8px;border-radius:20px">NOT SET</span>`;
        return `
          <div style="margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              ${lbl(v)}
              ${badge}
            </div>
            <div style="display:flex;gap:8px">
              <input type="password" name="${esc(v.key)}" value=""
                placeholder="${hasVal ? "Leave empty to keep current value" : "Enter value"}"
                autocomplete="new-password"
                style="${inputStyle};flex:1">
              ${v.generate ? `
                <button type="button" onclick="genSecret('${esc(v.key)}')"
                  style="padding:10px 16px;background:#f0fdf4;color:#154d37;border:1.5px solid #86efac;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0">
                  Generate
                </button>` : ""}
            </div>
            <div style="font-size:12px;color:#94a3b8;margin-top:4px">Secret values are never displayed. Leave blank to keep the current value.</div>
          </div>`;
      }

      return `
        <div style="margin-bottom:16px">
          ${lbl(v)}
          <input type="text" name="${esc(v.key)}" value="${esc(cur)}"
            placeholder="${esc(v.placeholder || "")}"
            style="${inputStyle}">
          ${v.help ? `<div style="font-size:12px;color:#94a3b8;margin-top:4px">${esc(v.help)}</div>` : ""}
        </div>`;
    }).join("");

    return card(`
      <h3 style="margin-bottom:${group.help ? "6px" : "20px"}">${esc(group.group)}</h3>
      ${group.help ? `<p style="color:#64748b;font-size:13px;margin-bottom:20px">${esc(group.help)}</p>` : ""}
      ${fields}
    `);
  }).join("");

  const body = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">
      <div>
        <a href="/admin/settings" style="color:#94a3b8;text-decoration:none;font-size:14px">← Settings</a>
        <h2 style="margin-top:8px">Environment &amp; Secrets</h2>
        <p style="color:#64748b;font-size:14px;margin-top:4px">
          Writes to <code style="background:#f1f5f9;padding:1px 6px;border-radius:4px">.env</code> at the project root.
          Bun reads this file on startup automatically.
        </p>
      </div>
    </div>

    ${saved ? `
      <div style="background:#f0fdf4;color:#166534;border:1px solid #86efac;border-radius:12px;padding:14px 18px;margin-bottom:20px;display:flex;gap:10px;align-items:center">
        <span style="font-size:18px">✓</span>
        <strong>.env saved.</strong>&nbsp;Restart the server for changes to take effect.
      </div>` : ""}

    <div style="background:#fef3c7;color:#92400e;border-radius:12px;padding:14px 18px;margin-bottom:24px;display:flex;gap:12px;align-items:flex-start">
      <span style="font-size:18px;flex-shrink:0">⚠</span>
      <div style="font-size:14px">
        <strong>Secret values are never shown.</strong>
        Leave a secret field blank to keep its current value unchanged.
        Changes only take effect after a server restart.
        On cloud platforms (Railway, Render, Fly.io) set env vars through the platform dashboard instead.
      </div>
    </div>

    <form method="POST" action="/admin/settings/env">
      <input type="hidden" name="_csrf" value="${csrfToken}">
      ${sections}
      <button type="submit" class="btn btn-primary">Save .env File</button>
    </form>

    <script>
      function genSecret(key) {
        const arr = new Uint8Array(32);
        crypto.getRandomValues(arr);
        const hex = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
        const input = document.querySelector('[name="' + key + '"]');
        input.value = hex;
        input.type = 'text';
        setTimeout(() => { input.type = 'password'; }, 3000);
      }
    </script>
  `;

  return new Response(adminHTML("Environment & Secrets", body, session), { headers: { "Content-Type": "text/html" } });
});

// ─── Save ─────────────────────────────────────────────────────────────────────

export const handleSaveEnv = requireAuth(csrfProtect(async (req, params, session) => {
  if (!session.isSuperuser) return new Response("Superuser access required", { status: 403 });

  const form = req._form;
  const existing = existsSync(ENV_PATH) ? parseEnv(readFileSync(ENV_PATH, "utf8")) : {};
  const allVars = ENV_SCHEMA.flatMap(g => g.vars);

  for (const v of allVars) {
    const submitted = (form.get(v.key) ?? "").trim();
    if (v.secret) {
      // Blank secret = keep existing — never overwrite with empty
      if (submitted) existing[v.key] = submitted;
    } else {
      if (submitted) {
        existing[v.key] = submitted;
      } else {
        delete existing[v.key]; // Empty non-secret = remove the line
      }
    }
  }

  try {
    writeFileSync(ENV_PATH, serializeEnv(existing), "utf8");
  } catch (err) {
    const body = `<div class="card"><h2 style="color:#dc2626">Could not write .env</h2>
      <p style="margin:12px 0">${esc(err.message)}</p>
      <a href="/admin/settings/env" class="btn btn-secondary">← Back</a></div>`;
    return new Response(adminHTML("Error", body, session), { status: 500, headers: { "Content-Type": "text/html" } });
  }

  return Response.redirect("/admin/settings/env?saved=1", 302);
}));
