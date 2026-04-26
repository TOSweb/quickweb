// src/admin/developer.js
import { join } from "path";
import { readdir, mkdir, writeFile, readFile, rm } from "fs/promises";
import { adminHTML } from "./base.js";
import { requireAuth } from "../core/auth.js";
import { csrfProtect, generateCsrfToken } from "../core/csrf.js";

const THEME_PATH = join(process.cwd(), "themes", "default", "components");

export const componentTemplatesList = requireAuth(async (req, params, session) => {
  const folders = await readdir(THEME_PATH, { withFileTypes: true });
  const templates = folders.filter(f => f.isDirectory()).map(f => f.name);

  const body = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px">
        <h2>Component Templates (Code)</h2>
        <div>
            <a href="/admin/components/import" class="btn btn-secondary" style="margin-right:10px">📥 Import Theme ZIP</a>
            <button onclick="document.getElementById('new_tpl_modal').style.display='flex'" class="btn btn-primary">+ Create New Template</button>
        </div>
    </div>
    <p style="color:#666; margin-bottom:20px">Modify the Nunjucks and CSS code for your components. These define the "master" look for all instances.</p>
    
    <div class="card">
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:16px">
            ${templates.map(t => `
            <div class="card" style="padding:16px; text-align:center; margin-bottom:0">
                <div style="font-size:24px; margin-bottom:8px">🧩</div>
                <strong style="font-size:14px">${t}</strong>
                <div style="margin-top:12px; display:flex; gap:6px; justify-content:center">
                    <a href="/admin/developer/components/edit/${t}" class="btn btn-secondary" style="padding:4px 12px; font-size:11px">Edit Code</a>
                    <form method="POST" action="/admin/developer/components/${t}/delete" style="margin:0" onsubmit="return confirm('Delete template \'${t}\'? This removes the files from disk.')">
                        <input type="hidden" name="_csrf" value="${generateCsrfToken(session.id)}">
                        <button type="submit" class="btn btn-secondary" style="padding:4px 12px; font-size:11px; color:#ef4444">Delete</button>
                    </form>
                </div>
            </div>
            `).join("")}
        </div>
    </div>

    <!-- New Template Modal -->
    <div id="new_tpl_modal" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:100; justify-content:center; align-items:center">
        <div class="card" style="width:100%; max-width:400px">
            <h2>New Component Template</h2>
            <form method="POST" action="/admin/developer/components/new">
                <input type="hidden" name="_csrf" value="${generateCsrfToken(session.id)}">
                <label>Component Name (slug-style)</label>
                <input type="text" name="name" placeholder="e.g. newsletter-form" required>
                <button type="submit" class="btn btn-primary" style="width:100%; margin-top:20px">Create Files</button>
                <button type="button" onclick="document.getElementById('new_tpl_modal').style.display='none'" class="btn" style="width:100%; margin-top:10px">Cancel</button>
            </form>
        </div>
    </div>
  `;
  return new Response(adminHTML("Component Developer", body, session), { headers: { "Content-Type": "text/html" } });
});

export const editComponentTemplate = requireAuth(async (req, params, session) => {
  const url = new URL(req.url);
  const saved = url.searchParams.get("saved") === "1";
  const name = params.name;
  const njkPath = join(THEME_PATH, name, "template.njk");
  
  let njkCode = "";
  try { njkCode = await readFile(njkPath, "utf-8"); } catch { njkCode = "<!-- " + name + " template -->"; }

  // HTML-escape the code for safe embedding inside textarea
  const escapedCode = njkCode
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const successBanner = saved ? `
    <div style="background:#d1fae5; color:#065f46; padding:12px 20px; border-radius:12px; margin-bottom:20px; font-weight:600; display:flex; align-items:center; gap:8px">
        ✅ Template saved successfully!
    </div>
  ` : "";

  const body = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px">
        <h2>Editing Component: ${name}</h2>
        <a href="/admin/developer/components" style="text-decoration:none; color:#666">Back to list</a>
    </div>
    
    ${successBanner}

    <form method="POST">
        <input type="hidden" name="_csrf" value="${generateCsrfToken(session.id)}">
        <div class="card" style="padding:0; overflow:hidden">
            <div style="padding:10px 20px; background:#f8fafc; border-bottom:1px solid #e2e8f0; font-family:monospace; font-size:12px; font-weight:bold">template.njk</div>
            <textarea name="njk" style="width:100%; height:400px; border:none; padding:20px; font-family:monospace; font-size:14px; background:#1e293b; color:#cbd5e1; outline:none; resize:vertical">${escapedCode}</textarea>
        </div>
        <button type="submit" class="btn btn-primary" style="margin-top:20px">💾 Save Changes</button>
    </form>
  `;
  return new Response(adminHTML(`Edit ${name}`, body, session), { headers: { "Content-Type": "text/html" } });
});

export const handleSaveTemplate = requireAuth(csrfProtect(async (req, params, session) => {
  const name = params.name;
  const form = req._form;
  const njk = form.get("njk");
  
  const njkPath = join(THEME_PATH, name, "template.njk");
  await writeFile(njkPath, njk, "utf-8");
  
  return Response.redirect(`/admin/developer/components/edit/${name}?saved=1`, 302);
}));

export const handleCreateTemplate = requireAuth(csrfProtect(async (req, params, session) => {
  const name = req._form.get("name").toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  const dir = join(THEME_PATH, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "template.njk"), "", "utf-8");
  return Response.redirect(`/admin/developer/components/edit/${name}`, 302);
}));

export const handleDeleteTemplate = requireAuth(csrfProtect(async (req, params, _session) => {
  const name = params.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  await rm(join(THEME_PATH, name), { recursive: true, force: true });
  return Response.redirect("/admin/developer/components", 302);
}));
