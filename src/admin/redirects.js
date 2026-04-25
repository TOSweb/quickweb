// src/admin/redirects.js
import { getDB } from "../db.js";
import { adminHTML } from "./base.js";
import { requireAuth } from "../core/auth.js";
import { csrfProtect, generateCsrfToken } from "../core/csrf.js";

export const redirectsList = requireAuth(async (req, params, session) => {
  const db = getDB();
  const redirects = await db.all("SELECT * FROM redirects ORDER BY created_at DESC");
  const csrfToken = generateCsrfToken(session.id);

  const rows = redirects.map(r => `
    <tr>
      <td style="font-family:monospace;font-size:13px">${esc(r.from_url)}</td>
      <td style="color:#94a3b8">→</td>
      <td style="font-family:monospace;font-size:13px">${esc(r.to_url)}</td>
      <td><span class="badge badge-info">${r.status_code}</span></td>
      <td>
        <form method="POST" action="/admin/redirects/${r.id}/delete" style="display:inline" onsubmit="return confirm('Delete?')">
          <input type="hidden" name="_csrf" value="${csrfToken}">
          <button type="submit" class="btn btn-secondary" style="padding:6px 14px;font-size:13px;color:#ef4444">Delete</button>
        </form>
      </td>
    </tr>
  `).join("");

  const body = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h2>URL Redirects</h2>
    </div>
    <div class="card" style="margin-bottom:20px;max-width:600px">
      <div style="font-weight:700;font-size:14px;margin-bottom:15px">Add Redirect</div>
      <form method="POST" action="/admin/redirects/new" style="display:grid;grid-template-columns:1fr auto 1fr auto auto;gap:10px;align-items:start">
        <input type="hidden" name="_csrf" value="${csrfToken}">
        <div>
          <div style="font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:4px">FROM</div>
          <input type="text" name="from_url" placeholder="/old-path" required style="margin-bottom:0">
        </div>
        <div style="padding-top:24px;color:#94a3b8">→</div>
        <div>
          <div style="font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:4px">TO</div>
          <input type="text" name="to_url" placeholder="/new-path" required style="margin-bottom:0">
        </div>
        <div>
          <div style="font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:4px">TYPE</div>
          <select name="status_code" style="margin-bottom:0;width:90px">
            <option value="301">301</option>
            <option value="302">302</option>
          </select>
        </div>
        <div style="padding-top:20px">
          <button type="submit" class="btn btn-primary">Add</button>
        </div>
      </form>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>From</th><th></th><th>To</th><th>Type</th><th>Actions</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#94a3b8">No redirects yet</td></tr>'}</tbody>
      </table>
    </div>
  `;
  return new Response(adminHTML("Redirects", body, session), { headers: { "Content-Type": "text/html" } });
});

export const handleNewRedirect = requireAuth(csrfProtect(async (req, params, session) => {
  const form = req._form;
  const fromUrl = form.get("from_url")?.trim();
  const toUrl = form.get("to_url")?.trim();
  const statusCode = parseInt(form.get("status_code") || "301");

  if (!fromUrl || !toUrl) return new Response("Both URLs required", { status: 400 });
  if (![301, 302].includes(statusCode)) return new Response("Invalid status code", { status: 400 });

  await getDB().run(
    "INSERT OR REPLACE INTO redirects (from_url, to_url, status_code) VALUES (?, ?, ?)",
    [fromUrl, toUrl, statusCode]
  );

  return Response.redirect("/admin/redirects", 302);
}));

export const handleDeleteRedirect = requireAuth(csrfProtect(async (req, params, session) => {
  await getDB().run("DELETE FROM redirects WHERE id = ?", [params.id]);
  return Response.redirect("/admin/redirects", 302);
}));

function esc(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
