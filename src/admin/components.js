// src/admin/components.js
import { getDB } from "../db.js";
import { adminHTML } from "./base.js";
import { requireAuth } from "../core/auth.js";
import { csrfProtect, generateCsrfToken } from "../core/csrf.js";
import { signContent } from "../core/sanitizer.js";

export const handleUpdateContent = requireAuth(csrfProtect(async (req, params, session) => {
  const db = getDB();
  const id = params.id;
  const body = req._body || {};
  const { field, value } = body;

  if (!field) return new Response("Missing field", { status: 400 });
  
  try {
    const comp = db.prepare("SELECT * FROM components WHERE id = ?").get(id);
    if (!comp) return new Response("Not found", { status: 404 });
    
    let content = {};
    try { 
      const parsed = JSON.parse(comp.content);
      content = (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
      content = {};
    }
    
    content[field] = value;
    const updatedJson = JSON.stringify(content);
    const hmac = signContent(updatedJson);
    
    db.run("UPDATE components SET content = ?, hmac_signature = ? WHERE id = ?", [updatedJson, hmac, id]);
    
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[API ERROR]:", err);
    return new Response("Internal Server Error: " + err.message, { status: 500 });
  }
}));

export const componentsList = requireAuth(async (req, params, session) => {
  const db = getDB();
  const components = db.prepare(`
    SELECT c.*, 
    (SELECT COUNT(*) FROM page_components pc WHERE pc.component_id = c.id) as usage_count
    FROM components c 
    ORDER BY c.created_at DESC
  `).all();
  const csrfToken = generateCsrfToken(session.id);
  const body = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px">
        <h2>Component Instances</h2>
        <a href="/admin/components/new" class="btn btn-primary">Create New Component</a>
    </div>
    <div class="card">
        <table>
            <thead>
                <tr><th>Type</th><th>Name / Template</th><th>Usage</th><th>Global?</th><th>Actions</th></tr>
            </thead>
            <tbody>
                ${components.map(c => `
                <tr>
                    <td><span class="badge badge-info">${c.type}</span></td>
                    <td><strong>${c.name}</strong> <span style="color:var(--text-muted);font-size:12px;margin-left:5px">#${c.id}</span></td>
                    <td style="color:var(--text-muted)">Used on ${c.usage_count} page(s)</td>
                    <td>
                        <form method="POST" action="/admin/api/components/toggle-global/${c.id}" style="display:inline">
                            <input type="hidden" name="_csrf" value="${csrfToken}">
                            <input type="checkbox" ${c.is_global ? 'checked' : ''} onchange="this.form.submit()" style="width:auto; cursor:pointer">
                        </form>
                    </td>
                    <td style="text-align:right">
                        <a href="/admin/components/delete/${c.id}" class="btn btn-secondary" style="padding:6px 12px; font-size:12px; color:#ef4444" onclick="return confirm('Delete?')">Delete</a>
                    </td>
                </tr>
                `).join("")}
            </tbody>
        </table>
    </div>
  `;
  return new Response(adminHTML("Components", body, session), { headers: { "Content-Type": "text/html" } });
});

export const newComponentPage = requireAuth(async (req, params, session) => {
  const csrfToken = generateCsrfToken(session.id);

  // Dynamically scan available templates
  const { join } = await import("path");
  const { readdirSync } = await import("fs");
  const componentsDir = join(process.cwd(), "themes", "default", "components");
  const entries = readdirSync(componentsDir, { withFileTypes: true });
  const templates = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const label = entry.name.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      templates.push({ value: entry.name, label });
    } else if (entry.name.endsWith(".html")) {
      const name = entry.name.replace(".html", "");
      const label = name.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      templates.push({ value: name, label });
    }
  }

  const body = `
    <div class="card" style="max-width:500px">
        <h2>Create Instance</h2>
        <form method="POST" action="/admin/components/new">
            <input type="hidden" name="_csrf" value="${csrfToken}">
            <label>Internal Name</label><input type="text" name="name" placeholder="e.g. Main Header" required>
            <label>Template Type</label>
            <select name="template">
                ${templates.map(t => `<option value="${t.value}">${t.label}</option>`).join("")}
            </select>
            <label style="display:inline-flex;align-items:center;margin-top:10px">
                <input type="checkbox" name="is_global" style="width:auto;margin-right:10px"> Make Global
            </label>
            <button type="submit" class="btn btn-primary" style="margin-top:20px;width:100%">Create Component</button>
        </form>
    </div>
  `;
  return new Response(adminHTML("New Component", body, session), { headers: { "Content-Type": "text/html" } });
});


export const handleNewComponent = requireAuth(csrfProtect(async (req, params, session) => {
  const form = req._form;
  const db = getDB();
  const name = form.get("name");
  const template = form.get("template");
  const isGlobal = form.get("is_global") === "on" ? 1 : 0;
  const templateType = template === 'post-loop' ? 'dynamic' : 'static';

  let content = "{}";
  if (template === "hero") content = JSON.stringify({ title: "New Hero Title", subtitle: "Enter subtitle here", button_text: "Learn More", button_url: "#" });
  if (template === "content-block") content = JSON.stringify({ text: "<p>Start writing...</p>" });
  const hmac = signContent(content);
  db.run("INSERT INTO components (name, type, content, hmac_signature, is_global, created_by) VALUES (?, ?, ?, ?, ?, ?)", [name, templateType, content, hmac, isGlobal, session.userId]);
  return Response.redirect("/admin/components", 302);
}));

export const handleToggleGlobal = requireAuth(csrfProtect(async (req, params, session) => {
  const db = getDB();
  const current = db.prepare("SELECT is_global FROM components WHERE id = ?").get(params.id);
  if (current) db.run("UPDATE components SET is_global = ? WHERE id = ?", [current.is_global ? 0 : 1, params.id]);
  return Response.redirect("/admin/components", 302);
}));

export const handleDeleteComponent = requireAuth(async (req, params, session) => {
  const db = getDB();
  db.run("DELETE FROM components WHERE id = ?", [params.id]);
  return Response.redirect("/admin/components", 302);
});
