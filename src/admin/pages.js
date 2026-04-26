// src/admin/pages.js
import { getDB } from "../db.js";
import { adminHTML } from "./base.js";
import { requireAuth } from "../core/auth.js";
import { csrfProtect, generateCsrfToken } from "../core/csrf.js";
import { signContent } from "../core/sanitizer.js";
import { deleteObjectPermissions } from "../core/permissions.js";
import { join } from "path";
import { readdirSync } from "fs";

function esc(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function getAvailableComponents() {
  const componentsDir = join(process.cwd(), "themes", "default", "components");
  const entries = readdirSync(componentsDir, { withFileTypes: true });
  const components = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const label = entry.name.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      const type = entry.name === "post-loop" ? "dynamic" : "static";
      components.push({ type, name: entry.name, label });
    } else if (entry.name.endsWith(".html")) {
      const name = entry.name.replace(".html", "");
      const label = name.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      components.push({ type: "static", name, label });
    }
  }

  return components;
}

export const pagesList = requireAuth(async (req, params, session) => {
  const db = getDB();
  const pages = await db.all("SELECT * FROM pages ORDER BY created_at DESC");

  const body = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px">
        <h2>Pages</h2>
        <a href="/admin/pages/new" class="btn btn-primary">Create New Page</a>
    </div>
    <div class="card">
        <table>
            <thead>
                <tr>
                    <th>Title</th>
                    <th>Slug</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${pages.map(p => `
                <tr>
                    <td><strong>${p.title}</strong></td>
                    <td>/${p.slug}</td>
                    <td><span class="badge ${p.status === 'published' ? 'badge-success' : 'badge-info'}">${p.status}</span></td>
                    <td>${new Date(p.created_at).toLocaleDateString()}</td>
                    <td style="text-align:right">
                        <a href="/admin/pages/edit/${p.id}" class="btn btn-secondary" style="padding:6px 12px; font-size:12px">Build</a>
                        <a href="/admin/pages/delete/${p.id}" class="btn btn-secondary" style="padding:6px 12px; font-size:12px; color:#ef4444" onclick="return confirm('Delete this page?')">Delete</a>
                    </td>
                </tr>
                `).join("")}
            </tbody>
        </table>
    </div>
  `;

  return new Response(adminHTML("Pages", body, session), { headers: { "Content-Type": "text/html" } });
});

export const newPagePage = requireAuth(async (req, params, session) => {
  const csrfToken = generateCsrfToken(session.id);
  const body = `
    <div class="card" style="max-width:600px">
        <h2>Create New Page</h2>
        <form method="POST" action="/admin/pages/new">
            <input type="hidden" name="_csrf" value="${csrfToken}">
            <label>Page Title</label>
            <input type="text" name="title" placeholder="e.g. Home Page" required id="title_input">
            <label>Slug (Leave empty for Home Page)</label>
            <input type="text" name="slug" placeholder="home" id="slug_input">
            <button type="submit" class="btn btn-primary">Create Page & Start Building</button>
        </form>
    </div>
  `;
  return new Response(adminHTML("Create Page", body, session), { headers: { "Content-Type": "text/html" } });
});

export const pageEditor = requireAuth(async (req, params, session) => {
  const db = getDB();
  const page = await db.get("SELECT * FROM pages WHERE id = ?", [params.id]);
  if (!page) return new Response("Page not found", { status: 404 });

  const activeComponents = await db.all(`
    SELECT c.*, pc.id as mapping_id, pc.sort_order
    FROM components c
    JOIN page_components pc ON c.id = pc.component_id
    WHERE pc.page_id = ?
    ORDER BY pc.sort_order ASC
  `, [params.id]);

  const available = getAvailableComponents();
  const csrfToken = generateCsrfToken(session.id);

  const body = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px">
        <div>
            <h2 style="margin-bottom:5px">${page.title} <span class="badge ${page.status === 'published' ? 'badge-success' : 'badge-info'}" style="font-size:12px; margin-left:10px">${page.status}</span></h2>
            <p style="color:#666; font-size:14px">Editing path: <a href="/${page.slug}" target="_blank" style="color:var(--primary)">/${page.slug}</a></p>
        </div>
        <div style="display:flex; gap:10px">
            <form method="POST" action="/admin/pages/toggle-status/${page.id}">
                <input type="hidden" name="_csrf" value="${csrfToken}">
                <button type="submit" class="btn btn-secondary">${page.status === 'published' ? 'Unpublish' : 'Publish'}</button>
            </form>
            <button onclick="document.getElementById('add_comp_modal').style.display='flex'" class="btn btn-primary">+ Add Component</button>
            <a href="/${page.slug}?preview=1" target="_blank" class="btn" style="background:#eee">Preview Full Site</a>
        </div>
    </div>
    
    <div class="card" style="margin-bottom:20px; padding:20px">
        <h3 style="font-size:16px; margin:0 0 15px 0">SEO & OpenGraph Metadata</h3>
        <form method="POST" action="/admin/pages/update-seo/${page.id}">
            <input type="hidden" name="_csrf" value="${csrfToken}">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:15px">
                <div>
                    <label style="font-weight:600;font-size:13px;display:block;margin-bottom:5px">SEO Title <span style="font-weight:400;color:#94a3b8">(falls back to Title)</span></label>
                    <input type="text" name="seo_title" value="${esc(page.seo_title)}" style="width:100%;padding:12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafb;font-family:inherit">
                    <label style="font-weight:600;font-size:13px;display:block;margin:15px 0 5px 0">Meta Description</label>
                    <textarea name="meta_description" rows="2" maxlength="160" style="width:100%;padding:12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafb;font-family:inherit">${esc(page.meta_description)}</textarea>
                    <label style="font-weight:600;font-size:13px;display:block;margin:15px 0 5px 0">Schema JSON-LD</label>
                    <select name="schema_type" style="width:100%;padding:12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafb;font-family:inherit">
                        ${["WebPage","AboutPage","ContactPage","CollectionPage","FAQPage"].map(t => 
                            `<option value="${t}" ${(page.schema_type || "WebPage") === t ? "selected" : ""}>${t}</option>`
                        ).join("")}
                    </select>
                </div>
                <div>
                    <label style="font-weight:600;font-size:13px;display:block;margin-bottom:5px">OG Title</label>
                    <input type="text" name="og_title" value="${esc(page.og_title)}" style="width:100%;padding:12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafb;font-family:inherit">
                    <label style="font-weight:600;font-size:13px;display:block;margin:15px 0 5px 0">OG Description</label>
                    <textarea name="og_description" rows="2" style="width:100%;padding:12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafb;font-family:inherit">${esc(page.og_description)}</textarea>
                    <label style="font-weight:600;font-size:13px;display:block;margin:15px 0 5px 0">OG Image URL</label>
                    <input type="text" name="og_image" placeholder="/uploads/card.jpg" value="${esc(page.og_image)}" style="width:100%;padding:12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafb;font-family:inherit">
                </div>
            </div>
            <div style="margin-top:15px">
                <label style="font-weight:600;font-size:13px;display:block;margin-bottom:5px">Extra &lt;head&gt; HTML <span style="font-weight:400;color:#94a3b8">(scripts, styles, pixels — this page only)</span></label>
                <textarea name="custom_head" rows="4" placeholder="<script src='https://...'></script>" style="width:100%;padding:12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafb;font-family:monospace;font-size:12px">${esc(page.custom_head || "")}</textarea>
            </div>
            <button type="submit" class="btn btn-secondary">Save Metadata</button>
        </form>
    </div>

    <h3 style="font-size:16px; margin:0 0 15px 0">Page Components</h3>
    <div id="component_list">
        ${activeComponents.map(c => `
        <div class="card" style="margin-bottom:15px; display:flex; justify-content:space-between; align-items:center; padding:15px 25px">
            <div>
                <span style="font-size:12px; color:#999; text-transform:uppercase">${c.type}</span>
                <h3 style="font-size:16px; margin:5px 0">${c.name}</h3>
            </div>
            <div style="display:flex; align-items:center">
                <a href="/${page.slug}?edit=1" target="_blank" class="btn" style="font-size:13px; margin-right:10px; background:#e0f2fe; color:#0369a1">Edit Content Inline</a>
                <form method="POST" action="/admin/pages/remove-component/${c.mapping_id}" style="display:inline">
                    <input type="hidden" name="_csrf" value="${csrfToken}">
                    <button type="submit" style="background:none; border:none; color:#ef4444; cursor:pointer" onclick="return confirm('Remove?')">Remove</button>
                </form>
            </div>
        </div>
        `).join("")}
        ${activeComponents.length === 0 ? '<div class="card" style="text-align:center; padding:60px; color:#999">This page is empty. Add your first component to get started!</div>' : ''}
    </div>

    <!-- Add Component Modal -->
    <div id="add_comp_modal" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:100; justify-content:center; align-items:center">
        <div class="card" style="width:100%; max-width:500px">
            <h2>Add Component</h2>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-top:20px">
                ${available.map(a => `
                <form method="POST" action="/admin/pages/add-component/${page.id}">
                    <input type="hidden" name="_csrf" value="${csrfToken}">
                    <input type="hidden" name="name" value="${a.name}">
                    <input type="hidden" name="type" value="${a.type}">
                    <button type="submit" class="card" style="width:100%; text-align:left; cursor:pointer; margin-bottom:0">
                        <strong style="display:block">${a.label}</strong>
                        <span style="font-size:12px; color:#666">${a.type}</span>
                    </button>
                </form>
                `).join("")}
            </div>
            <button onclick="document.getElementById('add_comp_modal').style.display='none'" class="btn" style="margin-top:20px; width:100%">Cancel</button>
        </div>
    </div>
  `;
  return new Response(adminHTML("Page Builder", body, session), { headers: { "Content-Type": "text/html" } });
});

export const handleAddComponent = requireAuth(csrfProtect(async (req, params, session) => {
  const form = req._form;
  const db = getDB();
  const pageId = params.id;
  const name = form.get("name");
  const type = form.get("type");

  const content = "{}";
  const hmac = signContent(content);
  const compResult = await db.run(
    "INSERT INTO components (name, type, content, hmac_signature, created_by) VALUES (?, ?, ?, ?, ?)",
    [name, type, content, hmac, session.userId]
  );

  // Get next sort_order without a self-referencing subquery (MySQL safe)
  const orderRow = await db.get(
    "SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM page_components WHERE page_id = ?",
    [pageId]
  );
  await db.run(
    "INSERT INTO page_components (page_id, component_id, sort_order) VALUES (?, ?, ?)",
    [pageId, compResult.lastInsertRowid, orderRow.next_order]
  );

  return Response.redirect(`/admin/pages/edit/${pageId}`, 302);
}));

export const handleRemoveComponent = requireAuth(csrfProtect(async (req, params, session) => {
  const db = getDB();
  const mapping = await db.get("SELECT page_id FROM page_components WHERE id = ?", [params.id]);
  if (mapping) await db.run("DELETE FROM page_components WHERE id = ?", [params.id]);
  return Response.redirect(`/admin/pages/edit/${mapping.page_id}`, 302);
}));

export const handleNewPage = requireAuth(csrfProtect(async (req, params, session) => {
  const form = req._form;
  const db = getDB();
  try {
    const result = await db.run(
      "INSERT INTO pages (title, slug, created_by) VALUES (?, ?, ?)",
      [form.get("title"), form.get("slug") || "", session.userId]
    );
    return Response.redirect(`/admin/pages/edit/${result.lastInsertRowid}`, 302);
  } catch (e) {
    return new Response("Error: Slug might already be in use.", { status: 400 });
  }
}));

export const handleToggleStatus = requireAuth(csrfProtect(async (req, params, session) => {
  const db = getDB();
  const current = await db.get("SELECT status FROM pages WHERE id = ?", [params.id]);
  if (current) {
    const next = current.status === 'published' ? 'draft' : 'published';
    await db.run("UPDATE pages SET status = ? WHERE id = ?", [next, params.id]);
  }
  return Response.redirect(`/admin/pages/edit/${params.id}`, 302);
}));

export const handleUpdatePageSeo = requireAuth(csrfProtect(async (req, params, session) => {
  const form = req._form;
  const db = getDB();
  await db.run(`
    UPDATE pages SET
      seo_title=?, meta_description=?, og_title=?, og_description=?, og_image=?, schema_type=?, custom_head=?
    WHERE id=?
  `, [
    form.get("seo_title")?.trim() || null,
    form.get("meta_description")?.trim() || null,
    form.get("og_title")?.trim() || null,
    form.get("og_description")?.trim() || null,
    form.get("og_image")?.trim() || null,
    form.get("schema_type") || "WebPage",
    form.get("custom_head")?.trim() || null,
    params.id
  ]);
  return Response.redirect(`/admin/pages/edit/${params.id}`, 302);
}));

export const handleDeletePage = requireAuth(async (req, params, _session) => {
  const db = getDB();
  await db.run("DELETE FROM pages WHERE id = ?", [params.id]);
  await deleteObjectPermissions("page", params.id);
  return Response.redirect("/admin/pages", 302);
});
