// src/admin/blog.js
import { getDB } from "../db.js";
import { adminHTML } from "./base.js";
import { requireAuth } from "../core/auth.js";
import { csrfProtect, generateCsrfToken } from "../core/csrf.js";
import { sanitizeHtml, signContent } from "../core/sanitizer.js";
import { invalidateSitemap } from "../seo/sitemap.js";
import { createObjectPermissions, deleteObjectPermissions } from "../core/permissions.js";

function slugify(str) {
  return str.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// ─── Post List ────────────────────────────────────────────────────────────────

export const blogList = requireAuth(async (req, params, session) => {
  const db = getDB();
  const posts = db.prepare(`
    SELECT bp.*, u.username as author_name
    FROM blog_posts bp
    LEFT JOIN users u ON u.id = bp.author_id
    ORDER BY bp.created_at DESC
  `).all();

  const csrfToken = generateCsrfToken(session.id);

  const rows = posts.map(p => `
    <tr>
      <td>
        <strong>${esc(p.title)}</strong>
        <div style="font-size:12px;color:#94a3b8;margin-top:2px">/blog/${esc(p.slug)}</div>
      </td>
      <td>${esc(p.author_name || "—")}</td>
      <td>
        <span class="badge ${p.status === 'published' ? 'badge-success' : 'badge-info'}">
          ${p.status}
        </span>
      </td>
      <td style="font-size:13px;color:#94a3b8">${fmtDate(p.created_at)}</td>
      <td>
        <a href="/admin/blog/${p.id}/edit" class="btn btn-secondary" style="padding:6px 14px;font-size:13px">Edit</a>
        <form method="POST" action="/admin/blog/${p.id}/delete" style="display:inline" onsubmit="return confirm('Delete this post?')">
          <input type="hidden" name="_csrf" value="${csrfToken}">
          <button type="submit" class="btn btn-secondary" style="padding:6px 14px;font-size:13px;color:#ef4444">Delete</button>
        </form>
      </td>
    </tr>
  `).join("");

  const body = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h2>Blog Posts</h2>
      <a href="/admin/blog/new" class="btn btn-primary">+ New Post</a>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>Title</th><th>Author</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#94a3b8">No posts yet</td></tr>'}</tbody>
      </table>
    </div>
  `;
  return new Response(adminHTML("Blog", body, session), { headers: { "Content-Type": "text/html" } });
});

// ─── New Post ─────────────────────────────────────────────────────────────────

export const newPostPage = requireAuth(async (req, params, session) => {
  const db = getDB();
  const categories = db.prepare("SELECT * FROM blog_categories ORDER BY name").all();
  const tags = db.prepare("SELECT * FROM blog_tags ORDER BY name").all();
  const csrfToken = generateCsrfToken(session.id);

  const body = postForm({ csrfToken, categories, tags, action: "/admin/blog/new", post: null });
  return new Response(adminHTML("New Post", body, session), { headers: { "Content-Type": "text/html" } });
});

export const handleNewPost = requireAuth(csrfProtect(async (req, params, session) => {
  const form = req._form;
  const db = getDB();

  const title = form.get("title")?.trim();
  if (!title) return new Response("Title required", { status: 400 });

  const slug = form.get("slug")?.trim() || slugify(title);
  const rawContent = form.get("content") || "";
  const content = sanitizeHtml(rawContent);
  const excerpt = form.get("excerpt")?.trim() || null;
  const status = form.get("status") || "draft";
  const seoTitle = form.get("seo_title")?.trim() || null;
  const metaDesc = form.get("meta_description")?.trim() || null;
  const ogTitle = form.get("og_title")?.trim() || null;
  const ogDesc = form.get("og_description")?.trim() || null;
  const schemaType = form.get("schema_type") || "BlogPosting";
  const featuredImage = form.get("featured_image")?.trim() || null;
  const featuredImageAlt = form.get("featured_image_alt")?.trim() || null;

  if (metaDesc && metaDesc.length > 160) {
    return new Response("Meta description must be 160 characters or fewer", { status: 400 });
  }

  // Warn if publishing with missing SEO fields (don't block)
  const seoWarning = status === "published" && (!seoTitle && !title || !metaDesc)
    ? "<!-- SEO fields incomplete -->" : "";

  const result = db.prepare(`
    INSERT INTO blog_posts
      (title, slug, content, excerpt, featured_image, featured_image_alt,
       seo_title, meta_description, og_title, og_description, schema_type,
       status, author_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    title, slug, content, excerpt, featuredImage, featuredImageAlt,
    seoTitle, metaDesc, ogTitle, ogDesc, schemaType,
    status, session.userId
  );

  const postId = result.lastInsertRowid;
  createObjectPermissions("blogpost", postId);

  // Categories
  for (const catId of form.getAll("categories")) {
    db.prepare("INSERT OR IGNORE INTO blog_post_categories (post_id, category_id) VALUES (?, ?)").run(postId, catId);
  }
  // Tags — create new tags on the fly
  for (const tagName of (form.get("tags") || "").split(",").map(t => t.trim()).filter(Boolean)) {
    const tagSlug = slugify(tagName);
    db.prepare("INSERT OR IGNORE INTO blog_tags (name, slug) VALUES (?, ?)").run(tagName, tagSlug);
    const tag = db.prepare("SELECT id FROM blog_tags WHERE slug = ?").get(tagSlug);
    if (tag) db.prepare("INSERT OR IGNORE INTO blog_post_tags (post_id, tag_id) VALUES (?, ?)").run(postId, tag.id);
  }

  if (status === "published") invalidateSitemap();

  return Response.redirect("/admin/blog", 302);
}));

// ─── Edit Post ────────────────────────────────────────────────────────────────

export const editPostPage = requireAuth(async (req, params, session) => {
  const db = getDB();
  const post = db.prepare("SELECT * FROM blog_posts WHERE id = ?").get(params.id);
  if (!post) return new Response("Post not found", { status: 404 });

  const categories = db.prepare("SELECT * FROM blog_categories ORDER BY name").all();
  const allTags = db.prepare("SELECT * FROM blog_tags ORDER BY name").all();
  const postCatIds = db.prepare("SELECT category_id FROM blog_post_categories WHERE post_id = ?")
    .all(params.id).map(r => r.category_id);
  const postTags = db.prepare(`
    SELECT bt.name FROM blog_tags bt
    JOIN blog_post_tags bpt ON bpt.tag_id = bt.id
    WHERE bpt.post_id = ?
  `).all(params.id).map(r => r.name);

  const csrfToken = generateCsrfToken(session.id);
  const body = postForm({ csrfToken, categories, tags: allTags, action: `/admin/blog/${post.id}/edit`, post, postCatIds, postTags });
  return new Response(adminHTML("Edit Post", body, session), { headers: { "Content-Type": "text/html" } });
});

export const handleEditPost = requireAuth(csrfProtect(async (req, params, session) => {
  const form = req._form;
  const db = getDB();

  const post = db.prepare("SELECT * FROM blog_posts WHERE id = ?").get(params.id);
  if (!post) return new Response("Post not found", { status: 404 });

  const title = form.get("title")?.trim();
  if (!title) return new Response("Title required", { status: 400 });

  const newSlug = form.get("slug")?.trim() || slugify(title);
  const rawContent = form.get("content") || "";
  const content = sanitizeHtml(rawContent);
  const excerpt = form.get("excerpt")?.trim() || null;
  const status = form.get("status") || "draft";
  const seoTitle = form.get("seo_title")?.trim() || null;
  const metaDesc = form.get("meta_description")?.trim() || null;
  const ogTitle = form.get("og_title")?.trim() || null;
  const ogDesc = form.get("og_description")?.trim() || null;
  const schemaType = form.get("schema_type") || "BlogPosting";
  const featuredImage = form.get("featured_image")?.trim() || null;
  const featuredImageAlt = form.get("featured_image_alt")?.trim() || null;

  if (metaDesc && metaDesc.length > 160) {
    return new Response("Meta description must be 160 characters or fewer", { status: 400 });
  }

  // If slug changed on a published post, create a redirect
  if (post.slug !== newSlug && post.status === "published") {
    db.prepare(
      "INSERT OR IGNORE INTO redirects (from_url, to_url, status_code) VALUES (?, ?, 301)"
    ).run(`/blog/${post.slug}`, `/blog/${newSlug}`);
  }

  const wasPublished = post.status === "published";
  const nowPublished = status === "published";

  db.prepare(`
    UPDATE blog_posts SET
      title=?, slug=?, content=?, excerpt=?, featured_image=?, featured_image_alt=?,
      seo_title=?, meta_description=?, og_title=?, og_description=?, schema_type=?,
      status=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    title, newSlug, content, excerpt, featuredImage, featuredImageAlt,
    seoTitle, metaDesc, ogTitle, ogDesc, schemaType,
    status, params.id
  );

  // Sync categories
  db.prepare("DELETE FROM blog_post_categories WHERE post_id=?").run(params.id);
  for (const catId of form.getAll("categories")) {
    db.prepare("INSERT OR IGNORE INTO blog_post_categories (post_id, category_id) VALUES (?, ?)").run(params.id, catId);
  }

  // Sync tags
  db.prepare("DELETE FROM blog_post_tags WHERE post_id=?").run(params.id);
  for (const tagName of (form.get("tags") || "").split(",").map(t => t.trim()).filter(Boolean)) {
    const tagSlug = slugify(tagName);
    db.prepare("INSERT OR IGNORE INTO blog_tags (name, slug) VALUES (?, ?)").run(tagName, tagSlug);
    const tag = db.prepare("SELECT id FROM blog_tags WHERE slug = ?").get(tagSlug);
    if (tag) db.prepare("INSERT OR IGNORE INTO blog_post_tags (post_id, tag_id) VALUES (?, ?)").run(params.id, tag.id);
  }

  if (wasPublished !== nowPublished) invalidateSitemap();

  return Response.redirect("/admin/blog", 302);
}));

// ─── Delete Post ──────────────────────────────────────────────────────────────

export const handleDeletePost = requireAuth(csrfProtect(async (req, params, session) => {
  const db = getDB();
  const post = db.prepare("SELECT id, status FROM blog_posts WHERE id = ?").get(params.id);
  if (!post) return new Response("Post not found", { status: 404 });

  deleteObjectPermissions("blogpost", params.id);
  db.prepare("DELETE FROM blog_posts WHERE id = ?").run(params.id);
  invalidateSitemap();
  return Response.redirect("/admin/blog", 302);
}));

// ─── Categories ───────────────────────────────────────────────────────────────

export const categoriesList = requireAuth(async (req, params, session) => {
  const db = getDB();
  const cats = db.prepare(`
    SELECT bc.*, COUNT(bpc.post_id) as post_count
    FROM blog_categories bc
    LEFT JOIN blog_post_categories bpc ON bpc.category_id = bc.id
    GROUP BY bc.id ORDER BY bc.name
  `).all();
  const csrfToken = generateCsrfToken(session.id);

  const rows = cats.map(c => `
    <tr>
      <td><strong>${esc(c.name)}</strong></td>
      <td>/blog/category/${esc(c.slug)}</td>
      <td>${c.post_count}</td>
      <td>
        <a href="/admin/blog/categories/${c.id}/edit" class="btn btn-secondary" style="padding:6px 14px;font-size:13px">Edit</a>
        <form method="POST" action="/admin/blog/categories/${c.id}/delete" style="display:inline" onsubmit="return confirm('Delete?')">
          <input type="hidden" name="_csrf" value="${csrfToken}">
          <button type="submit" class="btn btn-secondary" style="padding:6px 14px;font-size:13px;color:#ef4444">Delete</button>
        </form>
      </td>
    </tr>
  `).join("");

  const body = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h2>Categories</h2>
      <a href="/admin/blog/categories/new" class="btn btn-primary">+ New Category</a>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>Name</th><th>URL</th><th>Posts</th><th>Actions</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:#94a3b8">No categories yet</td></tr>'}</tbody>
      </table>
    </div>
  `;
  return new Response(adminHTML("Categories", body, session), { headers: { "Content-Type": "text/html" } });
});

export const newCategoryPage = requireAuth(async (req, params, session) => {
  const csrfToken = generateCsrfToken(session.id);
  const body = categoryForm({ csrfToken, action: "/admin/blog/categories/new", cat: null });
  return new Response(adminHTML("New Category", body, session), { headers: { "Content-Type": "text/html" } });
});

export const handleNewCategory = requireAuth(csrfProtect(async (req, params, session) => {
  const form = req._form;
  const name = form.get("name")?.trim();
  if (!name) return new Response("Name required", { status: 400 });
  const slug = form.get("slug")?.trim() || slugify(name);
  const description = form.get("description")?.trim() || null;
  const metaDesc = form.get("meta_description")?.trim() || null;
  getDB().prepare("INSERT INTO blog_categories (name, slug, description, meta_description) VALUES (?, ?, ?, ?)").run(name, slug, description, metaDesc);
  return Response.redirect("/admin/blog/categories", 302);
}));

export const editCategoryPage = requireAuth(async (req, params, session) => {
  const cat = getDB().prepare("SELECT * FROM blog_categories WHERE id = ?").get(params.id);
  if (!cat) return new Response("Category not found", { status: 404 });
  const csrfToken = generateCsrfToken(session.id);
  const body = categoryForm({ csrfToken, action: `/admin/blog/categories/${cat.id}/edit`, cat });
  return new Response(adminHTML("Edit Category", body, session), { headers: { "Content-Type": "text/html" } });
});

export const handleEditCategory = requireAuth(csrfProtect(async (req, params, session) => {
  const form = req._form;
  const name = form.get("name")?.trim();
  if (!name) return new Response("Name required", { status: 400 });
  const slug = form.get("slug")?.trim() || slugify(name);
  const description = form.get("description")?.trim() || null;
  const metaDesc = form.get("meta_description")?.trim() || null;
  getDB().prepare("UPDATE blog_categories SET name=?, slug=?, description=?, meta_description=? WHERE id=?").run(name, slug, description, metaDesc, params.id);
  return Response.redirect("/admin/blog/categories", 302);
}));

export const handleDeleteCategory = requireAuth(csrfProtect(async (req, params, session) => {
  getDB().prepare("DELETE FROM blog_categories WHERE id = ?").run(params.id);
  return Response.redirect("/admin/blog/categories", 302);
}));

// ─── Form helpers ─────────────────────────────────────────────────────────────

function postForm({ csrfToken, categories, tags, action, post, postCatIds = [], postTags = [] }) {
  const v = (field) => esc(post?.[field] || "");

  const catCheckboxes = categories.map(c => `
    <label style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <input type="checkbox" name="categories" value="${c.id}" ${postCatIds.includes(c.id) ? "checked" : ""}> ${esc(c.name)}
    </label>
  `).join("") || '<p style="color:#94a3b8;font-size:13px">No categories — <a href="/admin/blog/categories">create one</a></p>';

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h2>${post ? "Edit Post" : "New Post"}</h2>
      <a href="/admin/blog" class="btn btn-secondary">← Back</a>
    </div>
    <form method="POST" action="${action}">
      <input type="hidden" name="_csrf" value="${csrfToken}">
      <div style="display:grid;grid-template-columns:1fr 320px;gap:20px;align-items:start">

        <div>
          <div class="card" style="margin-bottom:20px">
            <label style="font-weight:600;font-size:13px">Title</label>
            <input type="text" name="title" value="${v("title")}" required style="font-size:18px;font-weight:600">
            <label style="font-weight:600;font-size:13px">Slug</label>
            <input type="text" name="slug" value="${v("slug")}" placeholder="auto-generated from title">
            <label style="font-weight:600;font-size:13px">Content</label>
            <textarea name="content" rows="16" style="font-family:monospace;font-size:13px">${v("content")}</textarea>
            <label style="font-weight:600;font-size:13px">Excerpt <span style="color:#94a3b8;font-weight:400">(optional)</span></label>
            <textarea name="excerpt" rows="3">${v("excerpt")}</textarea>
          </div>

          <div class="card">
            <div style="font-weight:700;font-size:14px;margin-bottom:15px">SEO</div>
            <label style="font-weight:600;font-size:13px">SEO Title <span style="color:#94a3b8;font-weight:400">(falls back to title)</span></label>
            <input type="text" name="seo_title" value="${v("seo_title")}">
            <label style="font-weight:600;font-size:13px">Meta Description <span style="color:#94a3b8;font-weight:400">(max 160 chars)</span></label>
            <textarea name="meta_description" rows="2" maxlength="160">${v("meta_description")}</textarea>
            <label style="font-weight:600;font-size:13px">OG Title</label>
            <input type="text" name="og_title" value="${v("og_title")}">
            <label style="font-weight:600;font-size:13px">OG Description</label>
            <textarea name="og_description" rows="2">${v("og_description")}</textarea>
            <label style="font-weight:600;font-size:13px">Schema Type</label>
            <select name="schema_type">
              ${["BlogPosting","Article","NewsArticle"].map(t =>
                `<option value="${t}" ${(post?.schema_type || "BlogPosting") === t ? "selected" : ""}>${t}</option>`
              ).join("")}
            </select>
          </div>
        </div>

        <div>
          <div class="card" style="margin-bottom:20px">
            <label style="font-weight:600;font-size:13px">Status</label>
            <select name="status">
              ${["draft","published"].map(s =>
                `<option value="${s}" ${(post?.status || "draft") === s ? "selected" : ""}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`
              ).join("")}
            </select>
            <button type="submit" class="btn btn-primary" style="width:100%;margin-top:5px">
              ${post ? "Save Changes" : "Create Post"}
            </button>
          </div>

          <div class="card" style="margin-bottom:20px">
            <div style="font-weight:700;font-size:14px;margin-bottom:12px">Featured Image</div>
            <label style="font-weight:600;font-size:13px">Image URL</label>
            <input type="text" name="featured_image" value="${v("featured_image")}" placeholder="/uploads/...">
            <label style="font-weight:600;font-size:13px">Alt Text</label>
            <input type="text" name="featured_image_alt" value="${v("featured_image_alt")}">
          </div>

          <div class="card" style="margin-bottom:20px">
            <div style="font-weight:700;font-size:14px;margin-bottom:12px">Categories</div>
            ${catCheckboxes}
          </div>

          <div class="card">
            <div style="font-weight:700;font-size:14px;margin-bottom:12px">Tags</div>
            <input type="text" name="tags" value="${esc(postTags.join(", "))}" placeholder="tag1, tag2, tag3">
            <div style="font-size:12px;color:#94a3b8">Comma-separated. New tags created automatically.</div>
          </div>
        </div>
      </div>
    </form>
  `;
}

function categoryForm({ csrfToken, action, cat }) {
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h2>${cat ? "Edit Category" : "New Category"}</h2>
      <a href="/admin/blog/categories" class="btn btn-secondary">← Back</a>
    </div>
    <div class="card" style="max-width:560px">
      <form method="POST" action="${action}">
        <input type="hidden" name="_csrf" value="${csrfToken}">
        <label style="font-weight:600;font-size:13px">Name</label>
        <input type="text" name="name" value="${esc(cat?.name || "")}" required>
        <label style="font-weight:600;font-size:13px">Slug</label>
        <input type="text" name="slug" value="${esc(cat?.slug || "")}" placeholder="auto-generated">
        <label style="font-weight:600;font-size:13px">Description</label>
        <textarea name="description" rows="3">${esc(cat?.description || "")}</textarea>
        <label style="font-weight:600;font-size:13px">Meta Description</label>
        <textarea name="meta_description" rows="2">${esc(cat?.meta_description || "")}</textarea>
        <button type="submit" class="btn btn-primary" style="width:100%">${cat ? "Save" : "Create"}</button>
      </form>
    </div>
  `;
}

function esc(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtDate(str) {
  if (!str) return "—";
  return new Date(str).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
