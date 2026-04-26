// src/admin/content-types.js — UI-driven content type builder
import { getDB, getSetting } from "../db.js";
import { adminHTML } from "./base.js";
import { requireAuth } from "../core/auth.js";
import { csrfProtect, generateCsrfToken } from "../core/csrf.js";
import { reloadCoreContentTypes } from "../core/plugins.js";
import { readdirSync } from "fs";
import { join } from "path";

const FIELD_TYPES = ["text", "textarea", "rich", "number", "email", "url", "date", "select", "checkbox", "image"];
const RESERVED_NAMES = new Set(["id", "slug", "status", "created_at", "updated_at"]);

function getThemeTemplates() {
  const theme = getSetting("active_theme") || "default";
  const dir = join(process.cwd(), "themes", theme);
  try {
    return readdirSync(dir).filter(f => f.endsWith(".html")).map(f => f.replace(".html", "")).sort();
  } catch { return []; }
}

function toSlug(str) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function toTableName(slug) {
  return "ct_" + slug.replace(/-/g, "_");
}

function fieldToSqlType(type) {
  if (type === "number") return "REAL";
  if (type === "checkbox") return "INTEGER DEFAULT 0";
  return "TEXT";
}

function esc(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function templateSelect(name, current, placeholder = "— none —") {
  const templates = getThemeTemplates();
  const opts = [`<option value="">${placeholder}</option>`, ...templates.map(t =>
    `<option value="${esc(t)}" ${current === t ? "selected" : ""}>${esc(t)}.html</option>`
  )].join("");
  return `<select name="${name}" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafb;font-family:inherit">${opts}</select>`;
}

// ─── Field builder HTML + JS ──────────────────────────────────────────────────

function fieldBuilderUI(existingFields = [], isEdit = false) {
  const existingNames = existingFields.map(f => f.name);
  const typeOpts = FIELD_TYPES.map(t => `<option value="${t}">${t}</option>`).join("");
  const INPUT = `padding:9px 12px;border:1px solid #e2e8f0;border-radius:8px;font-family:inherit;background:#f8fafb`;
  const INPUT_LOCK = `padding:9px 12px;border:1px solid #e2e8f0;border-radius:8px;font-family:inherit;background:#f1f5f9;color:#64748b`;

  const rowHtml = (f = {}, locked = false) => {
    const optionsVal = (f.type === "select" && Array.isArray(f.options)) ? f.options.join(", ") : "";
    const showOpts = f.type === "select";
    return `
    <div class="field-group" style="margin-bottom:10px">
      <div class="field-row" style="display:grid;grid-template-columns:1fr 1fr 130px 80px 36px;gap:8px;align-items:center">
        <input class="f-label" type="text" placeholder="Label" value="${esc(f.label || "")}"
          ${locked ? "readonly" : `oninput="autoName(this)"`} style="${locked ? INPUT_LOCK : INPUT}">
        <input class="f-name" type="text" placeholder="column_name" value="${esc(f.name || "")}"
          ${locked ? "readonly" : ""} style="${locked ? INPUT_LOCK : INPUT};font-family:monospace;font-size:13px">
        <select class="f-type" ${locked ? "disabled" : ""} onchange="toggleOpts(this)"
          style="padding:9px 10px;border:1px solid #e2e8f0;border-radius:8px;${locked ? "background:#f1f5f9;color:#64748b" : "background:#f8fafb"};font-family:inherit">
          ${FIELD_TYPES.map(t => `<option value="${t}" ${(f.type || "text") === t ? "selected" : ""}>${t}</option>`).join("")}
        </select>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:#64748b;cursor:pointer;white-space:nowrap">
          <input class="f-required" type="checkbox" ${f.required ? "checked" : ""} ${locked ? "disabled" : ""}
            style="width:16px;height:16px;margin:0;cursor:pointer"> Req
        </label>
        ${locked
          ? `<span title="Existing fields cannot be removed" style="color:#cbd5e1;font-size:18px;cursor:not-allowed;text-align:center">✕</span>`
          : `<button type="button" onclick="this.closest('.field-group').remove()" title="Remove field"
              style="background:#fee2e2;color:#ef4444;border:none;border-radius:8px;width:36px;height:36px;cursor:pointer;font-size:16px">✕</button>`}
      </div>
      <div class="field-options-row" style="display:${showOpts ? "flex" : "none"};align-items:center;gap:8px;padding:6px 0 0 2px">
        <span style="font-size:12px;color:#94a3b8;white-space:nowrap;flex-shrink:0">Options:</span>
        <input class="f-options" type="text" placeholder="e.g. Small, Medium, Large"
          value="${esc(optionsVal)}" ${locked ? "readonly" : ""}
          style="flex:1;padding:7px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;${locked ? "background:#f1f5f9;color:#64748b" : "background:#f8fafb"}">
        <span style="font-size:12px;color:#cbd5e1">comma-separated · used in forms &amp; filters</span>
      </div>
    </div>`;
  };

  const existingRows = existingFields.map(f => rowHtml(f, isEdit)).join("");

  return `
    <div id="field-rows">${existingRows}</div>
    <button type="button" onclick="addField()"
      style="background:#f0fdf4;color:#154d37;border:1.5px dashed #86efac;border-radius:10px;padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer;width:100%;margin-top:4px">
      + Add Field
    </button>
    <input type="hidden" name="fields_json" id="fields_json">
    ${isEdit ? `<p style="font-size:12px;color:#94a3b8;margin-top:8px">Existing fields (grey) cannot be removed — the DB column is preserved. Add new fields freely.</p>` : ""}
    <script>
      const existingNames = ${JSON.stringify(existingNames)};
      const reservedNames = ${JSON.stringify([...RESERVED_NAMES])};

      function autoName(labelInput) {
        const grp = labelInput.closest('.field-group');
        const nameInput = grp.querySelector('.f-name');
        if (!nameInput.value) {
          nameInput.value = labelInput.value.toLowerCase().replace(/\\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        }
      }

      function toggleOpts(select) {
        const grp = select.closest('.field-group');
        grp.querySelector('.field-options-row').style.display = select.value === 'select' ? 'flex' : 'none';
      }

      function addField() {
        const grp = document.createElement('div');
        grp.className = 'field-group';
        grp.style = 'margin-bottom:10px';
        grp.innerHTML = \`
          <div class="field-row" style="display:grid;grid-template-columns:1fr 1fr 130px 80px 36px;gap:8px;align-items:center">
            <input class="f-label" type="text" placeholder="Label" oninput="autoName(this)"
              style="padding:9px 12px;border:1px solid #e2e8f0;border-radius:8px;font-family:inherit;background:#f8fafb">
            <input class="f-name" type="text" placeholder="column_name"
              style="padding:9px 12px;border:1px solid #e2e8f0;border-radius:8px;font-family:monospace;font-size:13px;background:#f8fafb">
            <select class="f-type" onchange="toggleOpts(this)"
              style="padding:9px 10px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafb;font-family:inherit">
              ${typeOpts}
            </select>
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:#64748b;cursor:pointer;white-space:nowrap">
              <input class="f-required" type="checkbox" style="width:16px;height:16px;margin:0;cursor:pointer"> Req
            </label>
            <button type="button" onclick="this.closest('.field-group').remove()"
              style="background:#fee2e2;color:#ef4444;border:none;border-radius:8px;width:36px;height:36px;cursor:pointer;font-size:16px">✕</button>
          </div>
          <div class="field-options-row" style="display:none;align-items:center;gap:8px;padding:6px 0 0 2px">
            <span style="font-size:12px;color:#94a3b8;white-space:nowrap;flex-shrink:0">Options:</span>
            <input class="f-options" type="text" placeholder="e.g. Small, Medium, Large"
              style="flex:1;padding:7px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;background:#f8fafb">
            <span style="font-size:12px;color:#cbd5e1">comma-separated · used in forms &amp; filters</span>
          </div>
        \`;
        document.getElementById('field-rows').appendChild(grp);
      }

      document.querySelector('form').addEventListener('submit', (e) => {
        const groups = document.querySelectorAll('.field-group');
        const data = [];
        const seen = new Set(existingNames);
        let valid = true;
        groups.forEach(grp => {
          const name = grp.querySelector('.f-name').value.trim();
          const label = grp.querySelector('.f-label').value.trim();
          const type = grp.querySelector('.f-type').value;
          const required = grp.querySelector('.f-required').checked;
          const optRaw = grp.querySelector('.f-options').value.trim();
          if (!name && !label) return;
          if (!name || !label) { valid = false; alert('Each field needs a label and a column name.'); return; }
          if (!/^[a-z][a-z0-9_]*$/.test(name)) { valid = false; alert('Column "' + name + '" must start with a letter and use only a–z, 0–9, _'); return; }
          if (reservedNames.includes(name)) { valid = false; alert('"' + name + '" is a reserved system name.'); return; }
          if (seen.has(name)) { valid = false; alert('Duplicate column: ' + name); return; }
          seen.add(name);
          const field = { name, label, type, required };
          if (type === 'select' && optRaw) field.options = optRaw.split(',').map(s => s.trim()).filter(Boolean);
          data.push(field);
        });
        if (!valid) { e.preventDefault(); return; }
        document.getElementById('fields_json').value = JSON.stringify(data);
      });

      // auto-generate slug from label
      const labelInput = document.getElementById('ct_label');
      const slugInput  = document.getElementById('ct_slug');
      const singInput  = document.getElementById('ct_singular');
      if (labelInput && slugInput) {
        labelInput.addEventListener('input', () => {
          if (!slugInput.dataset.manual) {
            slugInput.value = labelInput.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          }
          if (!singInput.dataset.manual && labelInput.value) {
            singInput.value = labelInput.value.replace(/s$/i, '').trim();
          }
        });
        slugInput.addEventListener('input', () => { slugInput.dataset.manual = '1'; });
        singInput.addEventListener('input', () => { singInput.dataset.manual = '1'; });
      }
    </script>
  `;
}

// ─── List ─────────────────────────────────────────────────────────────────────

export const contentTypesList = requireAuth(async (req, params, session) => {
  const db = getDB();
  const dbTypes = await db.all("SELECT * FROM content_types ORDER BY label ASC");
  const csrfToken = generateCsrfToken(session.id);

  const rows = dbTypes.length
    ? dbTypes.map(ct => {
        let fieldCount = 0;
        try { fieldCount = JSON.parse(ct.fields_json || "[]").length; } catch {}
        return `
        <tr>
          <td><strong>${esc(ct.label)}</strong></td>
          <td style="font-family:monospace;font-size:13px;color:#64748b">/${esc(ct.slug)}</td>
          <td style="color:#64748b">${fieldCount} custom field${fieldCount !== 1 ? "s" : ""}</td>
          <td style="color:#64748b">${esc(ct.list_template || "—")} / ${esc(ct.detail_template || "—")}</td>
          <td style="text-align:right;white-space:nowrap">
            <a href="/admin/content-types/${ct.id}/edit" class="btn btn-secondary" style="padding:5px 14px;font-size:12px;margin-right:6px">Edit</a>
            <form method="POST" action="/admin/content-types/${ct.id}/delete" style="display:inline"
              onsubmit="return confirm('Remove content type \\'${esc(ct.label)}\\'? The data table \\'${esc(ct.table_name)}\\' is kept — no data is deleted.')">
              <input type="hidden" name="_csrf" value="${csrfToken}">
              <button type="submit" class="btn btn-secondary" style="padding:5px 14px;font-size:12px;color:#ef4444">Remove</button>
            </form>
          </td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:50px">
        No content types yet. <a href="/admin/content-types/new" style="color:#154d37">Create the first one →</a>
      </td></tr>`;

  const body = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <div>
        <h2>Content Types</h2>
        <p style="color:#64748b;font-size:14px;margin-top:4px">Define reusable data models. Each type gets a list view and detail view automatically.</p>
      </div>
      <a href="/admin/content-types/new" class="btn btn-primary">+ New Content Type</a>
    </div>
    <div class="card">
      <table>
        <thead><tr>
          <th>Name</th><th>URL Prefix</th><th>Fields</th><th>Templates (list / detail)</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
  return new Response(adminHTML("Content Types", body, session), { headers: { "Content-Type": "text/html" } });
});

// ─── New ──────────────────────────────────────────────────────────────────────

export const newContentTypePage = requireAuth(async (req, params, session) => {
  const csrfToken = generateCsrfToken(session.id);
  const body = `
    <div style="margin-bottom:20px">
      <a href="/admin/content-types" style="color:#94a3b8;text-decoration:none;font-size:14px">← Content Types</a>
    </div>
    <form method="POST" action="/admin/content-types/new">
      <input type="hidden" name="_csrf" value="${csrfToken}">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">

        <div class="card">
          <h3 style="margin-bottom:20px">Basic Info</h3>
          <div style="margin-bottom:16px">
            <label style="display:block;font-weight:600;font-size:13px;margin-bottom:6px">Display Name <span style="color:#ef4444">*</span></label>
            <input id="ct_label" type="text" name="label" required placeholder="e.g. Services, Team Members, Portfolio"
              style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafb;font-family:inherit">
          </div>
          <div style="margin-bottom:16px">
            <label style="display:block;font-weight:600;font-size:13px;margin-bottom:6px">Singular Name <span style="color:#ef4444">*</span></label>
            <input id="ct_singular" type="text" name="singular" required placeholder="e.g. Service, Member, Project"
              style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafb;font-family:inherit">
          </div>
          <div style="margin-bottom:0">
            <label style="display:block;font-weight:600;font-size:13px;margin-bottom:6px">URL Prefix <span style="color:#ef4444">*</span></label>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="color:#94a3b8;font-size:14px">/</span>
              <input id="ct_slug" type="text" name="slug" required placeholder="services"
                style="flex:1;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafb;font-family:monospace;font-size:14px">
            </div>
            <div style="font-size:12px;color:#94a3b8;margin-top:4px">Auto-generated from name. List view: <code>/services</code> &nbsp; Detail view: <code>/services/my-item</code></div>
          </div>
        </div>

        <div class="card">
          <h3 style="margin-bottom:20px">Templates &amp; Routing</h3>
          <div style="margin-bottom:16px">
            <label style="display:block;font-weight:600;font-size:13px;margin-bottom:6px">List Template</label>
            ${templateSelect("list_template", "")}
            <div style="font-size:12px;color:#94a3b8;margin-top:4px">Renders at <code>/services</code> with <code>{{ items }}</code> available</div>
          </div>
          <div style="margin-bottom:16px">
            <label style="display:block;font-weight:600;font-size:13px;margin-bottom:6px">Detail Template</label>
            ${templateSelect("detail_template", "")}
            <div style="font-size:12px;color:#94a3b8;margin-top:4px">Renders at <code>/services/my-item</code> with <code>{{ object }}</code> available</div>
          </div>
          <div style="margin-bottom:0">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-weight:600;font-size:13px">
              <input type="checkbox" name="has_public_urls" value="1" checked style="width:18px;height:18px;margin:0;cursor:pointer">
              Enable public URLs &amp; sitemap
            </label>
            <div style="font-size:12px;color:#94a3b8;margin-top:6px">Items will be accessible on the public site and included in sitemap.xml</div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <div>
            <h3 style="margin:0">Custom Fields</h3>
            <p style="color:#64748b;font-size:13px;margin-top:4px">
              System columns auto-added to every item's table:
              <code style="background:#f1f5f9;padding:1px 6px;border-radius:4px;font-size:12px">id</code>
              <code style="background:#f1f5f9;padding:1px 6px;border-radius:4px;font-size:12px">slug</code>
              <code style="background:#f1f5f9;padding:1px 6px;border-radius:4px;font-size:12px">status</code>
              <code style="background:#f1f5f9;padding:1px 6px;border-radius:4px;font-size:12px">created_at</code>
              — define your additional columns below:
            </p>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 130px 80px 36px;gap:8px;margin-bottom:8px">
          <div style="font-size:12px;font-weight:600;color:#94a3b8;padding:0 4px">LABEL</div>
          <div style="font-size:12px;font-weight:600;color:#94a3b8;padding:0 4px">COLUMN NAME</div>
          <div style="font-size:12px;font-weight:600;color:#94a3b8;padding:0 4px">TYPE</div>
          <div style="font-size:12px;font-weight:600;color:#94a3b8;padding:0 4px">REQUIRED</div>
          <div></div>
        </div>
        ${fieldBuilderUI([], false)}
      </div>

      <div style="margin-top:20px;display:flex;gap:12px">
        <button type="submit" class="btn btn-primary">Create Content Type</button>
        <a href="/admin/content-types" class="btn btn-secondary">Cancel</a>
      </div>
    </form>
  `;
  return new Response(adminHTML("New Content Type", body, session), { headers: { "Content-Type": "text/html" } });
});

export const handleNewContentType = requireAuth(csrfProtect(async (req, params, session) => {
  const form = req._form;
  const db = getDB();

  const label = (form.get("label") || "").trim();
  const singular = (form.get("singular") || "").trim();
  const slug = toSlug(form.get("slug") || label);
  const listTemplate = (form.get("list_template") || "").trim() || null;
  const detailTemplate = (form.get("detail_template") || "").trim() || null;
  const hasPublicUrls = form.get("has_public_urls") === "1" ? 1 : 0;
  const tableName = toTableName(slug);

  if (!label || !singular || !slug) {
    return new Response("Name, singular, and URL prefix are required.", { status: 400 });
  }

  let fields = [];
  try { fields = JSON.parse(form.get("fields_json") || "[]"); } catch {}

  // Build and run CREATE TABLE
  const customCols = fields.map(f => {
    const sqlType = fieldToSqlType(f.type);
    return `  ${f.name} ${sqlType}`;
  }).join(",\n");

  const createSql = `CREATE TABLE IF NOT EXISTS ${tableName} (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'published',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP${customCols ? ",\n" + customCols : ""}
)`;

  try {
    await db.exec(createSql.replace(/\bAUTOINCREMENT\b/g, db._isMysql ? "AUTO_INCREMENT" : "AUTOINCREMENT"));
  } catch (err) {
    return new Response(`Failed to create table: ${err.message}`, { status: 400 });
  }

  try {
    await db.run(
      `INSERT INTO content_types (slug, label, singular, table_name, list_template, detail_template, has_public_urls, fields_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [slug, label, singular, tableName, listTemplate, detailTemplate, hasPublicUrls, JSON.stringify(fields)]
    );
  } catch (err) {
    return new Response(`Failed to save content type: ${err.message}`, { status: 400 });
  }

  await reloadCoreContentTypes();
  return Response.redirect("/admin/content-types", 302);
}));

// ─── Edit ─────────────────────────────────────────────────────────────────────

export const editContentTypePage = requireAuth(async (req, params, session) => {
  const db = getDB();
  const ct = await db.get("SELECT * FROM content_types WHERE id = ?", [params.id]);
  if (!ct) return new Response("Not found", { status: 404 });

  let fields = [];
  try { fields = JSON.parse(ct.fields_json || "[]"); } catch {}

  const csrfToken = generateCsrfToken(session.id);
  const body = `
    <div style="margin-bottom:20px">
      <a href="/admin/content-types" style="color:#94a3b8;text-decoration:none;font-size:14px">← Content Types</a>
    </div>
    <form method="POST" action="/admin/content-types/${ct.id}/edit">
      <input type="hidden" name="_csrf" value="${csrfToken}">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">

        <div class="card">
          <h3 style="margin-bottom:20px">Basic Info</h3>
          <div style="margin-bottom:16px">
            <label style="display:block;font-weight:600;font-size:13px;margin-bottom:6px">Display Name</label>
            <input id="ct_label" type="text" name="label" required value="${esc(ct.label)}"
              style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafb;font-family:inherit">
          </div>
          <div style="margin-bottom:16px">
            <label style="display:block;font-weight:600;font-size:13px;margin-bottom:6px">Singular Name</label>
            <input id="ct_singular" type="text" name="singular" required value="${esc(ct.singular)}"
              style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafb;font-family:inherit">
          </div>
          <div style="margin-bottom:0">
            <label style="display:block;font-weight:600;font-size:13px;margin-bottom:6px">URL Prefix</label>
            <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#f1f5f9">
              <span style="color:#64748b;font-family:monospace">/${esc(ct.slug)}</span>
            </div>
            <div style="font-size:12px;color:#94a3b8;margin-top:4px">URL prefix cannot be changed after creation.</div>
          </div>
        </div>

        <div class="card">
          <h3 style="margin-bottom:20px">Templates &amp; Routing</h3>
          <div style="margin-bottom:16px">
            <label style="display:block;font-weight:600;font-size:13px;margin-bottom:6px">List Template</label>
            ${templateSelect("list_template", ct.list_template)}
            <div style="font-size:12px;color:#94a3b8;margin-top:4px">Receives: <code>{{ items }}</code>, <code>{{ content_type }}</code></div>
          </div>
          <div style="margin-bottom:16px">
            <label style="display:block;font-weight:600;font-size:13px;margin-bottom:6px">Detail Template</label>
            ${templateSelect("detail_template", ct.detail_template)}
            <div style="font-size:12px;color:#94a3b8;margin-top:4px">Receives: <code>{{ object }}</code>, <code>{{ ${esc(ct.singular.toLowerCase())} }}</code></div>
          </div>
          <div style="margin-bottom:0">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-weight:600;font-size:13px">
              <input type="checkbox" name="has_public_urls" value="1" ${ct.has_public_urls ? "checked" : ""} style="width:18px;height:18px;margin:0;cursor:pointer">
              Enable public URLs &amp; sitemap
            </label>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <div>
            <h3 style="margin:0">Custom Fields</h3>
            <p style="color:#64748b;font-size:13px;margin-top:4px">
              System columns (always present):
              <code style="background:#f1f5f9;padding:1px 6px;border-radius:4px;font-size:12px">id</code>
              <code style="background:#f1f5f9;padding:1px 6px;border-radius:4px;font-size:12px">slug</code>
              <code style="background:#f1f5f9;padding:1px 6px;border-radius:4px;font-size:12px">status</code>
              <code style="background:#f1f5f9;padding:1px 6px;border-radius:4px;font-size:12px">created_at</code>
              — add your custom columns below. Existing columns cannot be removed.
            </p>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 130px 80px 36px;gap:8px;margin-bottom:8px">
          <div style="font-size:12px;font-weight:600;color:#94a3b8;padding:0 4px">LABEL</div>
          <div style="font-size:12px;font-weight:600;color:#94a3b8;padding:0 4px">COLUMN NAME</div>
          <div style="font-size:12px;font-weight:600;color:#94a3b8;padding:0 4px">TYPE</div>
          <div style="font-size:12px;font-weight:600;color:#94a3b8;padding:0 4px">REQUIRED</div>
          <div></div>
        </div>
        ${fieldBuilderUI(fields, true)}
      </div>

      <div style="margin-top:20px;display:flex;gap:12px">
        <button type="submit" class="btn btn-primary">Save Changes</button>
        <a href="/admin/content-types" class="btn btn-secondary">Cancel</a>
      </div>
    </form>
  `;
  return new Response(adminHTML(`Edit: ${ct.label}`, body, session), { headers: { "Content-Type": "text/html" } });
});

export const handleEditContentType = requireAuth(csrfProtect(async (req, params, session) => {
  const form = req._form;
  const db = getDB();

  const ct = await db.get("SELECT * FROM content_types WHERE id = ?", [params.id]);
  if (!ct) return new Response("Not found", { status: 404 });

  const label = (form.get("label") || "").trim();
  const singular = (form.get("singular") || "").trim();
  const listTemplate = (form.get("list_template") || "").trim() || null;
  const detailTemplate = (form.get("detail_template") || "").trim() || null;
  const hasPublicUrls = form.get("has_public_urls") === "1" ? 1 : 0;

  let oldFields = [];
  try { oldFields = JSON.parse(ct.fields_json || "[]"); } catch {}
  const oldNames = new Set(oldFields.map(f => f.name));

  let newFields = [];
  try { newFields = JSON.parse(form.get("fields_json") || "[]"); } catch {}

  // Filter to only genuinely new fields
  const addedFields = newFields.filter(f => !oldNames.has(f.name));

  // ALTER TABLE for each new field
  for (const f of addedFields) {
    try {
      await db.run(`ALTER TABLE ${ct.table_name} ADD COLUMN ${f.name} ${fieldToSqlType(f.type)}`);
    } catch (err) {
      if (!err.message.includes("duplicate")) {
        return new Response(`Failed to add column ${f.name}: ${err.message}`, { status: 400 });
      }
    }
  }

  // Merge: keep all old fields + append new ones
  const mergedFields = [...oldFields, ...addedFields];

  await db.run(
    `UPDATE content_types SET label=?, singular=?, list_template=?, detail_template=?, has_public_urls=?, fields_json=? WHERE id=?`,
    [label, singular, listTemplate, detailTemplate, hasPublicUrls, JSON.stringify(mergedFields), ct.id]
  );

  await reloadCoreContentTypes();
  return Response.redirect("/admin/content-types", 302);
}));

// ─── Delete ───────────────────────────────────────────────────────────────────

export const handleDeleteContentType = requireAuth(csrfProtect(async (req, params, session) => {
  const db = getDB();
  await db.run("DELETE FROM content_types WHERE id = ?", [params.id]);
  await reloadCoreContentTypes();
  return Response.redirect("/admin/content-types", 302);
}));
