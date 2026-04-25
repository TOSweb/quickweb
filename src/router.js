import config from "./config.js";
import { adminRouter } from "./admin/router.js";
import { htmlResponse, renderComponents } from "./core/theme.js";
import { getDB, getSetting } from "./db.js";
import { getSession, getTokenFromRequest } from "./core/auth.js";
import { buildMeta } from "./seo/meta.js";
import { buildSchema } from "./seo/schema.js";
import { serveSitemap, serveRobots } from "./seo/sitemap.js";
import { join } from "path";
import { existsSync } from "fs";
import { webInstallerPage, handleWebInstaller } from "./admin/web-installer.js";

export async function router(req) {
  const url = new URL(req.url);
  let path = url.pathname;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

  // --- WEB INSTALLER INTERCEPT ---
  if (config.isSetupRequired) {
    if (path === "/setup-installer" && req.method === "POST") {
      return handleWebInstaller(req);
    }
    // Any other path gets the setup page
    return webInstallerPage(req);
  }

  const token = getTokenFromRequest(req);
  const session = getSession(token);
  const isAdmin = !!session;
  const isEditing = isAdmin && url.searchParams.get("edit") === "1";

  // 1. Static theme assets
  if (path.startsWith("/assets/")) {
    const theme = getSetting("active_theme") || "default";
    const filePath = join(process.cwd(), "themes", theme, path);
    if (existsSync(filePath)) return new Response(Bun.file(filePath));
    return new Response("Not found", { status: 404 });
  }

  // 2. Admin static assets (auth-gated)
  if (path.startsWith("/admin/static/")) {
    if (!isAdmin) return new Response("Forbidden", { status: 403 });
    const filePath = join(process.cwd(), "src", "static", "admin", path.replace("/admin/static/", ""));
    if (existsSync(filePath)) return new Response(Bun.file(filePath));
    return new Response("Not found", { status: 404 });
  }

  // 3. Uploads
  if (path.startsWith("/uploads/")) {
    const filePath = join(process.cwd(), "data", path);
    if (existsSync(filePath)) return new Response(Bun.file(filePath));
    return new Response("Not found", { status: 404 });
  }

  // 4. SEO endpoints
  if (path === "/sitemap.xml") return serveSitemap();
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
    const hasUser = db.prepare("SELECT id FROM users LIMIT 1").get();
    if (!hasUser) return Response.redirect("/admin/setup", 302);
  }

  // Check redirects table first for all public paths
  const redirect = db.prepare("SELECT * FROM redirects WHERE from_url = ?").get(path);
  if (redirect) {
    return new Response(null, {
      status: redirect.status_code,
      headers: { Location: redirect.to_url },
    });
  }

  // Blog listing  /blog or /
  if (path === "/blog" || path === "/") {
    const isHome = path === "/";
    // If "/" has a published page, show that instead of blog listing
    if (isHome) {
      const homePage = db.prepare("SELECT * FROM pages WHERE slug = '' AND (status='published' OR ? = 1)").get(isAdmin ? 1 : 0);
      if (homePage) {
        const components_html = await renderComponents(homePage.id, { isAdmin, isEditing, session });
        const seo_head = buildMeta({ page: homePage }) + "\n  " + buildSchema({ page: homePage });
        return htmlResponse(homePage.template || "page", { page: homePage, isAdmin, isEditing, session, components_html, seo_head });
      }
    }

    const perPage = parseInt(getSetting("posts_per_page") || "10");
    const pageNum = parseInt(url.searchParams.get("page") || "1");
    const offset = (pageNum - 1) * perPage;

    const posts = db.prepare(`
      SELECT * FROM blog_posts WHERE status='published' OR ? = 1
      ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(isAdmin ? 1 : 0, perPage, offset);

    const total = db.prepare("SELECT COUNT(*) as c FROM blog_posts WHERE status='published' OR ? = 1").get(isAdmin ? 1 : 0).c;

    return htmlResponse("index", { posts, page: pageNum, total_pages: Math.ceil(total / perPage), isAdmin, isEditing, session });
  }

  // Blog single post  /blog/:slug
  const blogPostMatch = path.match(/^\/blog\/([^/]+)$/);
  if (blogPostMatch) {
    const post = db.prepare(
      "SELECT * FROM blog_posts WHERE slug = ? AND (status='published' OR ? = 1)"
    ).get(blogPostMatch[1], isAdmin ? 1 : 0);
    if (!post) return new Response("Post not found", { status: 404 });

    const seo_head = buildMeta({ post }) + "\n  " + buildSchema({ post });
    return htmlResponse("post", { post, isAdmin, isEditing, session, seo_head });
  }

  // Blog category archive  /blog/category/:slug
  const blogCatMatch = path.match(/^\/blog\/category\/([^/]+)$/);
  if (blogCatMatch) {
    const cat = db.prepare("SELECT * FROM blog_categories WHERE slug = ?").get(blogCatMatch[1]);
    if (!cat) return new Response("Category not found", { status: 404 });

    const posts = db.prepare(`
      SELECT bp.* FROM blog_posts bp
      JOIN blog_post_categories bpc ON bpc.post_id = bp.id
      WHERE bpc.category_id = ? AND (bp.status='published' OR ? = 1)
      ORDER BY bp.created_at DESC
    `).all(cat.id, isAdmin ? 1 : 0);

    return htmlResponse("index", { posts, category: cat, page: 1, total_pages: 1, isAdmin, isEditing, session });
  }

  // Blog tag archive  /blog/tag/:slug
  const blogTagMatch = path.match(/^\/blog\/tag\/([^/]+)$/);
  if (blogTagMatch) {
    const tag = db.prepare("SELECT * FROM blog_tags WHERE slug = ?").get(blogTagMatch[1]);
    if (!tag) return new Response("Tag not found", { status: 404 });

    const posts = db.prepare(`
      SELECT bp.* FROM blog_posts bp
      JOIN blog_post_tags bpt ON bpt.post_id = bp.id
      WHERE bpt.tag_id = ? AND (bp.status='published' OR ? = 1)
      ORDER BY bp.created_at DESC
    `).all(tag.id, isAdmin ? 1 : 0);

    return htmlResponse("index", { posts, tag, page: 1, total_pages: 1, isAdmin, isEditing, session });
  }

  // CMS page
  const page = db.prepare(
    "SELECT * FROM pages WHERE slug = ? AND (status='published' OR ? = 1)"
  ).get(path.slice(1), isAdmin ? 1 : 0);

  if (page) {
    const components_html = await renderComponents(page.id, { isAdmin, isEditing, session });
    const seo_head = buildMeta({ page }) + "\n  " + buildSchema({ page });
    return htmlResponse(page.template || "page", { page, isAdmin, isEditing, session, components_html, seo_head });
  }

  return new Response("Page not found", { status: 404 });
}
