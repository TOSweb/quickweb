// src/core/builtins.js — Built-in template tags
import { registerTag } from "./tags.js";
import { getDB, getSetting } from "../db.js";

export function registerBuiltins() {

  // {% recentposts limit=5 category="slug" %}
  registerTag("recentposts", async ({ limit = 5, category } = {}) => {
    const db = getDB();
    let posts;
    if (category) {
      posts = db.prepare(`
        SELECT bp.title, bp.slug, bp.excerpt, bp.featured_image, bp.created_at
        FROM blog_posts bp
        JOIN blog_post_categories bpc ON bpc.post_id = bp.id
        JOIN blog_categories bc ON bc.id = bpc.category_id
        WHERE bp.status = 'published' AND bc.slug = ?
        ORDER BY bp.created_at DESC LIMIT ?
      `).all(category, limit);
    } else {
      posts = db.prepare(
        "SELECT title, slug, excerpt, featured_image, created_at FROM blog_posts WHERE status='published' ORDER BY created_at DESC LIMIT ?"
      ).all(limit);
    }
    if (!posts.length) return "";
    const items = posts.map(p => `
      <article class="recent-post">
        ${p.featured_image ? `<img src="${escAttr(p.featured_image)}" alt="" loading="lazy">` : ""}
        <h3><a href="/blog/${escAttr(p.slug)}">${escHtml(p.title)}</a></h3>
        ${p.excerpt ? `<p>${escHtml(p.excerpt)}</p>` : ""}
      </article>
    `).join("");
    return `<div class="recent-posts">${items}</div>`;
  });

  // {% menu name="primary" %}
  registerTag("menu", async ({ name = "primary" } = {}) => {
    const db = getDB();
    const pages = db.prepare(
      "SELECT title, slug FROM pages WHERE status='published' ORDER BY title"
    ).all();
    if (!pages.length) return "";
    const items = pages.map(p =>
      `<li><a href="/${escAttr(p.slug)}">${escHtml(p.title)}</a></li>`
    ).join("");
    return `<nav class="menu menu-${escAttr(name)}"><ul>${items}</ul></nav>`;
  });

  // {% categories %}
  registerTag("categories", async () => {
    const db = getDB();
    const cats = db.prepare(`
      SELECT bc.name, bc.slug, COUNT(bpc.post_id) as count
      FROM blog_categories bc
      LEFT JOIN blog_post_categories bpc ON bpc.category_id = bc.id
      LEFT JOIN blog_posts bp ON bp.id = bpc.post_id AND bp.status = 'published'
      GROUP BY bc.id
      ORDER BY bc.name
    `).all();
    if (!cats.length) return "";
    const items = cats.map(c =>
      `<li><a href="/blog/category/${escAttr(c.slug)}">${escHtml(c.name)} <span>(${c.count})</span></a></li>`
    ).join("");
    return `<ul class="categories">${items}</ul>`;
  });

  // {% siteinfo key="site_title" %}
  registerTag("siteinfo", async ({ key = "site_title" } = {}) => {
    const value = getSetting(key);
    return value ? escHtml(value) : "";
  });

  // {% searchform %}
  registerTag("searchform", async () => {
    return `
      <form class="search-form" action="/search" method="GET">
        <input type="search" name="q" placeholder="Search…" aria-label="Search">
        <button type="submit">Search</button>
      </form>
    `;
  });

  // {% divider style="solid" %}
  registerTag("divider", async ({ style = "solid" } = {}) => {
    return `<hr class="divider divider-${escAttr(style)}">`;
  });

  // {% if_plugin "name" %}...{% endif_plugin %} — block tag
  registerTag("if_plugin", async ({ name } = {}, body) => {
    // Plugins not loaded yet — always returns empty for now
    return "";
  }, { block: true });

  // {% cache seconds=3600 %}...{% endcache %} — block tag (no-op in v1, just renders body)
  registerTag("cache", async (attrs, body) => {
    return body;
  }, { block: true });

  // {% sitemap %}
  registerTag("sitemap", async () => {
    const db = getDB();
    const pages = db.prepare("SELECT title, slug FROM pages WHERE status='published' ORDER BY title").all();
    const posts = db.prepare("SELECT title, slug FROM blog_posts WHERE status='published' ORDER BY created_at DESC").all();

    const pageLinks = pages.map(p =>
      `<li><a href="/${escAttr(p.slug)}">${escHtml(p.title)}</a></li>`
    ).join("");
    const postLinks = posts.map(p =>
      `<li><a href="/blog/${escAttr(p.slug)}">${escHtml(p.title)}</a></li>`
    ).join("");

    return `
      <div class="html-sitemap">
        ${pageLinks ? `<section><h3>Pages</h3><ul>${pageLinks}</ul></section>` : ""}
        ${postLinks ? `<section><h3>Posts</h3><ul>${postLinks}</ul></section>` : ""}
      </div>
    `;
  });

  // {% hero title="..." subtitle="..." cta="..." cta_url="/" %}
  registerTag("hero", async ({ title = "", subtitle = "", cta = "", cta_url = "/" } = {}) => {
    return `
      <section class="hero">
        ${title ? `<h1>${escHtml(title)}</h1>` : ""}
        ${subtitle ? `<p class="hero-subtitle">${escHtml(subtitle)}</p>` : ""}
        ${cta ? `<a href="${escAttr(cta_url)}" class="hero-cta">${escHtml(cta)}</a>` : ""}
      </section>
    `;
  });

  // {% breadcrumb %} — uses ctx.page or ctx.post
  registerTag("breadcrumb", async (attrs, ctx) => {
    const crumbs = [{ label: "Home", url: "/" }];
    if (ctx?.post) {
      crumbs.push({ label: "Blog", url: "/blog" });
      crumbs.push({ label: ctx.post.title, url: null });
    } else if (ctx?.page) {
      crumbs.push({ label: ctx.page.title, url: null });
    }
    const items = crumbs.map((c, i) =>
      c.url
        ? `<li><a href="${escAttr(c.url)}">${escHtml(c.label)}</a></li>`
        : `<li aria-current="page">${escHtml(c.label)}</li>`
    ).join("<li aria-hidden='true'>/</li>");
    return `<nav aria-label="Breadcrumb"><ol class="breadcrumb">${items}</ol></nav>`;
  });
}

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escAttr(str) {
  return String(str ?? "").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
