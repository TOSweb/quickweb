import config from "./config.js";
import { adminRouter } from "./admin/router.js";
import { htmlResponse, renderComponents } from "./core/theme.js";
import { getDB, getSetting } from "./db.js";
import { getSession, getTokenFromRequest } from "./core/auth.js";
import { buildMeta } from "./seo/meta.js";
import { buildSchema } from "./seo/schema.js";
import { serveSitemap, serveRobots } from "./seo/sitemap.js";
import { join, extname } from "path";
import { existsSync } from "fs";
import { webInstallerPage, handleWebInstaller } from "./admin/web-installer.js";
import { getContentTypes } from "./core/plugins.js";

const MIME_TYPES = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".pdf": "application/pdf", ".json": "application/json",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
  ".ttf": "font/ttf", ".mp4": "video/mp4", ".webm": "video/webm",
};

async function serveFile(filePath) {
  if (typeof Bun !== "undefined") return new Response(Bun.file(filePath));
  const { readFile } = await import("fs/promises");
  const data = await readFile(filePath);
  const mime = MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream";
  return new Response(data, { headers: { "Content-Type": mime } });
}

function escHtml(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildPaginationHtml(current, total, pageUrl) {
  if (total <= 1) return "";
  const parts = [];
  if (current > 1) parts.push(`<a href="${pageUrl(current - 1)}" class="ct-pg">‹ Prev</a>`);
  const range = new Set([1, total]);
  for (let i = Math.max(1, current - 2); i <= Math.min(total, current + 2); i++) range.add(i);
  let prev = null;
  for (const p of [...range].sort((a, b) => a - b)) {
    if (prev !== null && p - prev > 1) parts.push(`<span style="color:#94a3b8;padding:0 2px">…</span>`);
    parts.push(`<a href="${pageUrl(p)}" class="ct-pg${p === current ? " ct-pg-active" : ""}">${p}</a>`);
    prev = p;
  }
  if (current < total) parts.push(`<a href="${pageUrl(current + 1)}" class="ct-pg">Next ›</a>`);
  return `<nav class="ct-pagination" style="display:flex;align-items:center;gap:6px;margin-top:32px;flex-wrap:wrap">
    ${parts.join("")}
  </nav>
  <style>
    .ct-pg{display:inline-flex;align-items:center;justify-content:center;padding:6px 12px;border:1px solid #e2e8f0;border-radius:8px;text-decoration:none;color:#64748b;font-size:14px;font-weight:500;background:white}
    .ct-pg:hover{border-color:#154d37;color:#154d37}
    .ct-pg-active{background:#154d37!important;color:white!important;border-color:#154d37!important}
  </style>`;
}

function buildFilterHtml(ct, activeFilters, sortField, sortDir) {
  const filterable = (ct.fields || []).filter(f => !["rich", "image", "textarea"].includes(f.type));
  if (!filterable.length) return "";
  const S = `padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;background:white;font-family:inherit;font-size:13px`;
  const inputs = filterable.map(f => {
    const val = escHtml(activeFilters[f.name] || "");
    if (f.type === "checkbox") {
      return `<select name="f_${escHtml(f.name)}" style="${S}">
        <option value="">All — ${escHtml(f.label)}</option>
        <option value="1" ${val === "1" ? "selected" : ""}>Yes</option>
        <option value="0" ${val === "0" ? "selected" : ""}>No</option>
      </select>`;
    }
    if (f.type === "select" && Array.isArray(f.options) && f.options.length) {
      const opts = [`<option value="">All — ${escHtml(f.label)}</option>`,
        ...f.options.map(o => `<option value="${escHtml(o)}" ${val === escHtml(o) ? "selected" : ""}>${escHtml(o)}</option>`)
      ].join("");
      return `<select name="f_${escHtml(f.name)}" style="${S}">${opts}</select>`;
    }
    const itype = f.type === "number" ? "number" : f.type === "date" ? "date" : "text";
    return `<input type="${itype}" name="f_${escHtml(f.name)}" value="${val}" placeholder="${escHtml(f.label)}" style="${S};min-width:130px">`;
  }).join("\n    ");
  const sortable = ["id", "created_at", ...(ct.fields || []).filter(f => !["rich", "image", "textarea"].includes(f.type)).map(f => f.name)];
  const sortOpts = sortable.map(s => `<option value="${escHtml(s)}" ${sortField === s ? "selected" : ""}>${escHtml(s.replace(/_/g, " "))}</option>`).join("");
  const hasActive = Object.keys(activeFilters).length > 0;
  const BTN = `padding:8px 16px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer`;
  return `<form method="GET" action="/${ct.slug}"
    style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:24px">
    ${inputs}
    <select name="sort" style="${S}">${sortOpts}</select>
    <select name="dir" style="${S}">
      <option value="desc" ${sortDir === "DESC" ? "selected" : ""}>Newest first</option>
      <option value="asc" ${sortDir === "ASC" ? "selected" : ""}>Oldest first</option>
    </select>
    <button type="submit" style="${BTN};background:#154d37;color:white">Apply</button>
    ${hasActive ? `<a href="/${ct.slug}" style="${BTN};background:#f1f5f9;color:#64748b;text-decoration:none">✕ Clear</a>` : ""}
  </form>`;
}

export async function router(req) {
  const url = new URL(req.url);
  let path = url.pathname;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

  // --- WEB INSTALLER INTERCEPT ---
  if (config.isSetupRequired) {
    if (path === "/setup-installer" && req.method === "POST") {
      return handleWebInstaller(req);
    }
    return webInstallerPage(req);
  }

  const token = getTokenFromRequest(req);
  const session = await getSession(token);
  const isAdmin = !!session;
  const isEditing = isAdmin && url.searchParams.get("edit") === "1";

  // 1. Static theme assets
  if (path.startsWith("/assets/")) {
    const theme = getSetting("active_theme") || "default";
    const filePath = join(process.cwd(), "themes", theme, path);
    if (existsSync(filePath)) {
      const res = await serveFile(filePath);
      res.headers.set("Cache-Control", "public, max-age=31536000, immutable");
      return res;
    }
    return new Response("Not found", { status: 404 });
  }

  // 2. Admin static assets (auth-gated)
  if (path.startsWith("/admin/static/")) {
    if (!isAdmin) return new Response("Forbidden", { status: 403 });
    const filePath = join(process.cwd(), "src", "static", "admin", path.replace("/admin/static/", ""));
    if (existsSync(filePath)) {
      const res = await serveFile(filePath);
      res.headers.set("Cache-Control", "public, max-age=31536000, immutable");
      return res;
    }
    return new Response("Not found", { status: 404 });
  }

  // 3. Uploads
  if (path.startsWith("/uploads/")) {
    const filePath = join(process.cwd(), "data", path);
    if (existsSync(filePath)) return serveFile(filePath);
    return new Response("Not found", { status: 404 });
  }

  // 4. SEO endpoints
  if (path === "/sitemap.xml") return await serveSitemap();
  if (path === "/robots.txt") return serveRobots();

  // 5. Admin routes
  if (path.startsWith("/admin")) {
    if (req.method === "POST") {
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        req._body = await req.json();
      } else {
        req._form = await req.formData();
      }
    }
    return adminRouter(req, path);
  }

  // 6. Public routes
  const db = getDB();

  // Setup redirect if no users exist
  if (path === "/") {
    const hasUser = await db.get("SELECT id FROM users LIMIT 1");
    if (!hasUser) return Response.redirect("/admin/setup", 302);
  }

  // Check redirects table first for all public paths
  const redirect = await db.get("SELECT * FROM redirects WHERE from_url = ?", [path]);
  if (redirect) {
    return new Response(null, {
      status: redirect.status_code,
      headers: { Location: redirect.to_url },
    });
  }

  // Blog listing  /blog or /
  if (path === "/blog" || path === "/") {
    const isHome = path === "/";
    if (isHome) {
      const homePage = await db.get(
        "SELECT * FROM pages WHERE slug = '' AND (status='published' OR ? = 1)",
        [isAdmin ? 1 : 0]
      );
      if (homePage) {
        const components_html = await renderComponents(homePage.id, { isAdmin, isEditing, session });
        const seo_head = buildMeta({ page: homePage }) + "\n  " + await buildSchema({ page: homePage });
        return htmlResponse(homePage.template || "page", { page: homePage, isAdmin, isEditing, session, components_html, seo_head });
      }
    }

    const perPage = parseInt(getSetting("posts_per_page") || "10");
    const pageNum = parseInt(url.searchParams.get("page") || "1");
    const offset = (pageNum - 1) * perPage;

    const posts = await db.all(`
      SELECT * FROM blog_posts WHERE status='published' OR ? = 1
      ORDER BY created_at DESC LIMIT ? OFFSET ?
    `, [isAdmin ? 1 : 0, perPage, offset]);

    const totalRow = await db.get(
      "SELECT COUNT(*) as c FROM blog_posts WHERE status='published' OR ? = 1",
      [isAdmin ? 1 : 0]
    );
    const total = totalRow.c;

    return htmlResponse("index", { posts, page: pageNum, total_pages: Math.ceil(total / perPage), isAdmin, isEditing, session });
  }

  // Blog single post  /blog/:slug
  const blogPostMatch = path.match(/^\/blog\/([^/]+)$/);
  if (blogPostMatch) {
    const post = await db.get(
      "SELECT * FROM blog_posts WHERE slug = ? AND (status='published' OR ? = 1)",
      [blogPostMatch[1], isAdmin ? 1 : 0]
    );
    if (!post) return new Response("Post not found", { status: 404 });

    const seo_head = buildMeta({ post }) + "\n  " + await buildSchema({ post });
    return htmlResponse("post", { post, isAdmin, isEditing, session, seo_head });
  }

  // Blog category archive  /blog/category/:slug
  const blogCatMatch = path.match(/^\/blog\/category\/([^/]+)$/);
  if (blogCatMatch) {
    const cat = await db.get("SELECT * FROM blog_categories WHERE slug = ?", [blogCatMatch[1]]);
    if (!cat) return new Response("Category not found", { status: 404 });

    const posts = await db.all(`
      SELECT bp.* FROM blog_posts bp
      JOIN blog_post_categories bpc ON bpc.post_id = bp.id
      WHERE bpc.category_id = ? AND (bp.status='published' OR ? = 1)
      ORDER BY bp.created_at DESC
    `, [cat.id, isAdmin ? 1 : 0]);

    return htmlResponse("index", { posts, category: cat, page: 1, total_pages: 1, isAdmin, isEditing, session });
  }

  // Blog tag archive  /blog/tag/:slug
  const blogTagMatch = path.match(/^\/blog\/tag\/([^/]+)$/);
  if (blogTagMatch) {
    const tag = await db.get("SELECT * FROM blog_tags WHERE slug = ?", [blogTagMatch[1]]);
    if (!tag) return new Response("Tag not found", { status: 404 });

    const posts = await db.all(`
      SELECT bp.* FROM blog_posts bp
      JOIN blog_post_tags bpt ON bpt.post_id = bp.id
      WHERE bpt.tag_id = ? AND (bp.status='published' OR ? = 1)
      ORDER BY bp.created_at DESC
    `, [tag.id, isAdmin ? 1 : 0]);

    return htmlResponse("index", { posts, tag, page: 1, total_pages: 1, isAdmin, isEditing, session });
  }

  // Content type list views and detail views
  const cts = getContentTypes();
  for (const ct of cts) {
    if (!ct.hasPublicUrls) continue;

    // List view: /:ct-slug  (paginated + filtered + sortable)
    if (path === `/${ct.slug}`) {
      const perPage = Math.max(1, parseInt(getSetting("posts_per_page") || "12"));
      const pageNum = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
      const hasStatus = ct._fromDB || (ct.fields && ct.fields.some(f => f.name === "status"));

      // Validate sort field against known fields to prevent injection
      const allowedSort = new Set(["id", "slug", "status", "created_at", "updated_at", ...(ct.fields || []).map(f => f.name)]);
      const rawSort = url.searchParams.get("sort") || "";
      const sortField = allowedSort.has(rawSort) ? rawSort : (ct.sortField || "id");
      const sortDir = url.searchParams.get("dir") === "asc" ? "ASC" : "DESC";

      // Build filter WHERE from query params (only fields defined on the type)
      const whereParts = [];
      const whereVals = [];
      const activeFilters = {};
      if (hasStatus) {
        whereParts.push("(status='published' OR ? = 1)");
        whereVals.push(isAdmin ? 1 : 0);
      }
      for (const f of (ct.fields || [])) {
        const val = url.searchParams.get(`f_${f.name}`);
        if (val === null || val === "") continue;
        activeFilters[f.name] = val;
        if (["text", "email", "url"].includes(f.type)) {
          whereParts.push(`${f.name} LIKE ?`);
          whereVals.push(`%${val}%`);
        } else {
          whereParts.push(`${f.name} = ?`);
          whereVals.push(val);
        }
      }
      const where = whereParts.length ? whereParts.join(" AND ") : "1=1";

      // Count for pagination
      const countRow = await db.get(`SELECT COUNT(*) as c FROM ${ct.table} WHERE ${where}`, whereVals);
      const total = countRow?.c || 0;
      const totalPages = Math.max(1, Math.ceil(total / perPage));
      const safePage = Math.min(pageNum, totalPages);
      const offset = (safePage - 1) * perPage;

      const items = await db.all(
        `SELECT * FROM ${ct.table} WHERE ${where} ORDER BY ${sortField} ${sortDir} LIMIT ? OFFSET ?`,
        [...whereVals, perPage, offset]
      );

      // Build pagination URL helper (preserves all filter/sort params)
      const baseParams = new URLSearchParams(url.searchParams);
      baseParams.delete("page");
      const bps = baseParams.toString();
      const pageUrl = (p) => `/${ct.slug}?page=${p}${bps ? "&" + bps : ""}`;

      const payload = {
        items,
        [ct.slug]: items,
        content_type: { label: ct.label, singular: ct.singular, slug: ct.slug },
        page: safePage,
        total_pages: totalPages,
        total,
        per_page: perPage,
        sort_field: sortField,
        sort_dir: sortDir.toLowerCase(),
        active_filters: activeFilters,
        pagination_html: buildPaginationHtml(safePage, totalPages, pageUrl),
        filter_html: buildFilterHtml(ct, activeFilters, sortField, sortDir),
        isAdmin, isEditing, session,
      };
      const seo_head = buildMeta({ page: { title: ct.label, seo_title: ct.label } }) + "\n  " + await buildSchema({ page: { title: ct.label } });
      payload.seo_head = seo_head;
      return htmlResponse(ct.listTemplate || ct.slug, payload);
    }

    // Detail view: /:ct-slug/:item-slug
    const ctMatch = path.match(new RegExp(`^/${ct.slug}/([^/]+)$`));
    if (ctMatch) {
      const hasStatus = ct._fromDB || (ct.fields && ct.fields.some(f => f.name === "status"));
      let obj;
      if (hasStatus) {
        obj = await db.get(
          `SELECT * FROM ${ct.table} WHERE slug = ? AND (status='published' OR ? = 1)`,
          [ctMatch[1], isAdmin ? 1 : 0]
        );
      } else {
        obj = await db.get(`SELECT * FROM ${ct.table} WHERE slug = ?`, [ctMatch[1]]);
      }
      if (obj) {
        const payload = { object: obj, isAdmin, isEditing, session };
        payload[ct.singular.toLowerCase()] = obj;
        const seo_head = buildMeta({ page: obj }) + "\n  " + await buildSchema({ page: obj });
        payload.seo_head = seo_head;
        const template = ct.detailTemplate || ct.singular.toLowerCase();
        return htmlResponse(template, payload);
      }
    }
  }

  // CMS page
  const page = await db.get(
    "SELECT * FROM pages WHERE slug = ? AND (status='published' OR ? = 1)",
    [path.slice(1), isAdmin ? 1 : 0]
  );

  if (page) {
    const components_html = await renderComponents(page.id, { isAdmin, isEditing, session });
    const seo_head = buildMeta({ page }) + "\n  " + await buildSchema({ page });
    return htmlResponse(page.template || "page", { page, isAdmin, isEditing, session, components_html, seo_head });
  }

  return new Response("Page not found", { status: 404 });
}
