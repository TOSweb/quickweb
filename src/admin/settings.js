// src/admin/settings.js
import { getDB, getSetting, setSetting } from "../db.js";
import { adminHTML } from "./base.js";
import { requireAuth } from "../core/auth.js";
import { csrfProtect, generateCsrfToken } from "../core/csrf.js";
import config from "../config.js";

export const settingsPage = requireAuth(async (req, params, session) => {
  const db = getDB();
  const pages = await db.all("SELECT id, title FROM pages ORDER BY title");
  const homepageType = getSetting("homepage_type") || "posts";
  const homepagePageId = getSetting("homepage_page_id");
  const csrfToken = generateCsrfToken(session.id);
  const isDev = config.env !== "production";

  const body = `
    <h2 style="margin-bottom:20px">Settings</h2>

    <!-- General -->
    <form method="POST" action="/admin/settings" enctype="multipart/form-data">
      <input type="hidden" name="_csrf" value="${csrfToken}">
      <div class="card" style="margin-bottom:20px">
        <div style="font-weight:700;font-size:14px;margin-bottom:20px">General</div>
        <label style="font-weight:600;font-size:13px">Site Title</label>
        <input type="text" name="site_title" value="${esc(getSetting("site_title") || "")}">
        <label style="font-weight:600;font-size:13px">Tagline</label>
        <input type="text" name="site_tagline" value="${esc(getSetting("site_tagline") || "")}">
        
        <label style="font-weight:600;font-size:13px">Site Logo</label>
        <div style="display:flex;align-items:center;gap:15px;margin-bottom:10px">
          ${getSetting('site_logo') ? `<img src="${getSetting('site_logo')}" style="height:36px;border-radius:4px;object-fit:contain">` : ''}
          <input type="file" name="site_logo" accept="image/*" style="margin:0;padding:8px" aria-label="Upload Site Logo">
        </div>
        
        <label style="font-weight:600;font-size:13px">Favicon</label>
        <div style="display:flex;align-items:center;gap:15px;margin-bottom:20px">
          ${getSetting('favicon') ? `<img src="${getSetting('favicon')}" style="height:32px;width:32px;object-fit:contain">` : ''}
          <input type="file" name="favicon" accept=".png,.ico,.svg" style="margin:0;padding:8px" aria-label="Upload Favicon">
        </div>
        <label style="font-weight:600;font-size:13px">Posts Per Page</label>
        <input type="number" name="posts_per_page" value="${esc(getSetting("posts_per_page") || "10")}" style="width:120px">
        <div style="font-weight:700;font-size:14px;margin:20px 0 15px">Homepage</div>
        <div style="margin-bottom:15px">
          <label style="display:inline-flex;align-items:center;gap:8px;margin-right:20px;font-size:14px">
            <input type="radio" name="homepage_type" value="posts" style="width:auto;margin:0" ${homepageType === "posts" ? "checked" : ""}> Latest Blog Posts
          </label>
          <label style="display:inline-flex;align-items:center;gap:8px;font-size:14px">
            <input type="radio" name="homepage_type" value="page" style="width:auto;margin:0" ${homepageType === "page" ? "checked" : ""}> A Static Page
          </label>
        </div>
        <div id="homepage_page_select" style="display:${homepageType === "page" ? "block" : "none"}">
          <select name="homepage_page_id">
            <option value="">— select page —</option>
            ${pages.map(p => `<option value="${p.id}" ${homepagePageId == p.id ? "selected" : ""}>${esc(p.title)}</option>`).join("")}
          </select>
        </div>
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>

    <!-- SEO Defaults -->
    <form method="POST" action="/admin/settings/seo">
      <input type="hidden" name="_csrf" value="${csrfToken}">
      <div class="card" style="margin-bottom:20px">
        <div style="font-weight:700;font-size:14px;margin-bottom:20px">SEO Defaults</div>
        <label style="font-weight:600;font-size:13px">Google Analytics ID</label>
        <input type="text" name="google_analytics_id" value="${esc(getSetting("google_analytics_id") || "")}" placeholder="G-XXXXXXXXXX">
        <label style="font-weight:600;font-size:13px">Custom Head HTML (CDNs, Scripts, Pixels)</label>
        <textarea name="custom_head" rows="4" placeholder="<script src='https://cdn...'></script>" style="font-family:monospace;font-size:12px">${esc(getSetting("custom_head") || "")}</textarea>
        <div style="display:flex;gap:20px;margin-bottom:15px">
          <label style="display:flex;align-items:center;gap:8px;font-size:14px">
            <input type="checkbox" name="sitemap_include_pages" value="1" style="width:auto;margin:0" ${getSetting("sitemap_include_pages") !== "0" ? "checked" : ""}> Include pages in sitemap
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:14px">
            <input type="checkbox" name="sitemap_include_posts" value="1" style="width:auto;margin:0" ${getSetting("sitemap_include_posts") !== "0" ? "checked" : ""}> Include posts in sitemap
          </label>
        </div>
        <button type="submit" class="btn btn-primary">Save SEO Settings</button>
      </div>
    </form>

    <!-- Hosting -->
    <form method="POST" action="/admin/settings/hosting">
      <input type="hidden" name="_csrf" value="${csrfToken}">
      <div class="card">
        <div style="font-weight:700;font-size:14px;margin-bottom:5px">Hosting</div>
        <div style="font-size:13px;color:#94a3b8;margin-bottom:20px">Used in sitemaps, canonical URLs, and Open Graph tags.</div>
        ${isDev ? `<div style="background:#fef3c7;color:#92400e;padding:10px 16px;border-radius:10px;font-size:13px;margin-bottom:20px">
          ⚠ Development mode — these settings affect localhost only
        </div>` : ""}
        <label style="font-weight:600;font-size:13px">Site URL <span style="color:#94a3b8;font-weight:400">(no trailing slash)</span></label>
        <input type="url" name="site_url" value="${esc(getSetting("site_url") || config.siteUrl || "")}" placeholder="https://example.com">
        <label style="font-weight:600;font-size:13px">Domain</label>
        <input type="text" name="domain" value="${esc(getSetting("domain") || config.domain || "")}" placeholder="example.com">
        <div style="font-weight:600;font-size:13px;margin-bottom:10px">DNS Setup</div>
        <div style="background:#f8fafc;border-radius:12px;padding:16px;font-family:monospace;font-size:12px;color:#475569">
          <div style="margin-bottom:8px"><strong>A record:</strong> @ → your-server-ip</div>
          <div><strong>A record:</strong> www → your-server-ip</div>
        </div>
        <button type="submit" class="btn btn-primary" style="margin-top:15px">Save Hosting Settings</button>
      </div>
    </form>

    <script>
      document.querySelectorAll('input[name="homepage_type"]').forEach(r =>
        r.addEventListener("change", e =>
          document.getElementById("homepage_page_select").style.display = e.target.value === "page" ? "block" : "none"
        )
      );
    </script>
  `;

  return new Response(adminHTML("Settings", body, session), { headers: { "Content-Type": "text/html" } });
});

export const saveSettings = requireAuth(csrfProtect(async (req, params, session) => {
  const form = req._form;
  await setSetting("site_title",     form.get("site_title"));
  await setSetting("site_tagline",   form.get("site_tagline"));
  await setSetting("posts_per_page", form.get("posts_per_page"));
  await setSetting("homepage_type",  form.get("homepage_type"));
  await setSetting("homepage_page_id", form.get("homepage_page_id"));

  const { join, extname } = await import("path");
  const { mkdirSync, writeFileSync } = await import("fs");
  const uploadDir = join(process.cwd(), "data", "uploads");
  mkdirSync(uploadDir, { recursive: true });

  const logoFile = form.get("site_logo");
  if (logoFile && logoFile.size > 0) {
    const ext = extname(logoFile.name) || ".png";
    const filename = `site_logo${Date.now()}${ext}`;
    writeFileSync(join(uploadDir, filename), Buffer.from(await logoFile.arrayBuffer()));
    await setSetting("site_logo", `/uploads/${filename}`);
  }

  const faviconFile = form.get("favicon");
  if (faviconFile && faviconFile.size > 0) {
    const ext = extname(faviconFile.name) || ".png";
    const filename = `favicon${Date.now()}${ext}`;
    writeFileSync(join(uploadDir, filename), Buffer.from(await faviconFile.arrayBuffer()));
    await setSetting("favicon", `/uploads/${filename}`);
  }

  return Response.redirect("/admin/settings", 302);
}));

export const saveSeoSettings = requireAuth(csrfProtect(async (req, params, session) => {
  const form = req._form;
  await setSetting("google_analytics_id",   form.get("google_analytics_id"));
  await setSetting("custom_head",           form.get("custom_head") || "");
  await setSetting("sitemap_include_pages", form.get("sitemap_include_pages") === "1" ? "1" : "0");
  await setSetting("sitemap_include_posts", form.get("sitemap_include_posts") === "1" ? "1" : "0");

  const { invalidateSitemap } = await import("../seo/sitemap.js");
  invalidateSitemap();

  return Response.redirect("/admin/settings", 302);
}));

export const saveHostingSettings = requireAuth(csrfProtect(async (req, params, session) => {
  const form = req._form;
  await setSetting("site_url", form.get("site_url")?.replace(/\/$/, ""));
  await setSetting("domain",   form.get("domain"));
  return Response.redirect("/admin/settings", 302);
}));

function esc(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
