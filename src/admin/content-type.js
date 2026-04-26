// src/admin/content-type.js — generic CRUD admin pages for content types
import { getDB } from "../db.js";
import { adminHTML } from "./base.js";
import { requireAuth } from "../core/auth.js";
import { csrfProtect, generateCsrfToken } from "../core/csrf.js";

function slugify(str) {
  return String(str).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function uniqueSlug(db, table, base, excludeId) {
  let candidate = base || "item";
  let i = 2;
  while (true) {
    const query = excludeId
      ? `SELECT id FROM ${table} WHERE slug = ? AND id != ?`
      : `SELECT id FROM ${table} WHERE slug = ?`;
    const params = excludeId ? [candidate, excludeId] : [candidate];
    const existing = await db.get(query, params);
    if (!existing) return candidate;
    candidate = `${base}-${i++}`;
  }
}

// Build handler set for one registered content type definition.
// Called once per type, result cached in the router.
export function makeContentTypeHandlers(typeDef) {
  const {
    slug,
    label,
    singular,
    table,
    titleField,
    fields,
    sortField = "id",
    sortDir = "DESC",
    _fromDB = false,
  } = typeDef;

  const singularLabel = singular || label.replace(/s$/, "");

  // Extra system fields shown only for DB-managed types
  const systemFields = _fromDB ? [
    { name: "_slug",   label: "URL Slug",   type: "text",   _system: true,  placeholder: "auto-generated from title" },
    { name: "_status", label: "Status",     type: "select", _system: true,  options: ["published", "draft"] },
  ] : [];

  // List all rows
  const list = requireAuth(async (req, params, session) => {
    const db = getDB();
    let items;
    try {
      items = await db.all(`SELECT * FROM ${table} ORDER BY ${sortField} ${sortDir}`);
    } catch (err) {
      return errorPage(`Could not read table "${table}": ${err.message}`, label, session);
    }

    const csrfToken = generateCsrfToken(session.id);
    const listFields = fields.filter(f => f.list !== false).slice(0, 4);

    const rows = items.length
      ? items.map(item => `
        <tr>
          <td><strong>${esc(item[titleField] ?? `#${item.id}`)}</strong></td>
          ${listFields
            .filter(f => f.name !== titleField)
            .map(f => `<td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(fmtCell(item[f.name], f))}</td>`)
            .join("")}
          <td style="text-align:right;white-space:nowrap">
            <a href="/admin/${slug}/${item.id}/edit" class="btn btn-secondary"
              style="padding:5px 14px;font-size:12px;margin-right:6px">Edit</a>
            <form method="POST" action="/admin/${slug}/${item.id}/delete"
              style="display:inline" onsubmit="return confirm('Delete this item?')">
              <input type="hidden" name="_csrf" value="${csrfToken}">
              <button type="submit" class="btn btn-secondary"
                style="padding:5px 14px;font-size:12px;color:#ef4444">Delete</button>
            </form>
          </td>
        </tr>
      `).join("")
      : `<tr><td colspan="10" style="text-align:center;color:#94a3b8;padding:50px">
          No ${label.toLowerCase()} yet.
          <a href="/admin/${slug}/new" style="color:#154d37">Add the first one →</a>
        </td></tr>`;

    const body = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <h2>${esc(label)}</h2>
        <a href="/admin/${slug}/new" class="btn btn-primary">+ Add ${esc(singularLabel)}</a>
      </div>
      <div class="card">
        <table>
          <thead>
            <tr>
              <th>${esc(fields.find(f => f.name === titleField)?.label || titleField)}</th>
              ${listFields
                .filter(f => f.name !== titleField)
                .map(f => `<th>${esc(f.label)}</th>`)
                .join("")}
              <th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
    return new Response(adminHTML(label, body, session), {
      headers: { "Content-Type": "text/html" },
    });
  });

  // New item form
  const newItem = requireAuth(async (req, params, session) => {
    const csrfToken = generateCsrfToken(session.id);
    const body = `
      <div style="margin-bottom:20px">
        <a href="/admin/${slug}" style="color:#94a3b8;text-decoration:none;font-size:14px">
          ← ${esc(label)}
        </a>
      </div>
      <div class="card">
        <h2 style="margin-bottom:24px">Add ${esc(singularLabel)}</h2>
        <form method="POST" action="/admin/${slug}/new">
          <input type="hidden" name="_csrf" value="${csrfToken}">
          ${renderFields(fields, {})}
          ${_fromDB ? renderSystemFields(systemFields, {}) : ""}
          <button type="submit" class="btn btn-primary" style="margin-top:8px">Save</button>
        </form>
      </div>
    `;
    return new Response(adminHTML(`New ${singularLabel}`, body, session), {
      headers: { "Content-Type": "text/html" },
    });
  });

  // Handle new item submission
  const handleNew = requireAuth(csrfProtect(async (req, params, session) => {
    const form = req._form;
    const db = getDB();
    const cols = fields.map(f => f.name);
    const vals = cols.map(name => formVal(form, fields.find(f => f.name === name)));

    if (_fromDB) {
      // Auto-generate slug from title field
      const rawSlug = (form.get("_slug") || "").trim();
      const titleVal = String(form.get(titleField) || "");
      const base = rawSlug || slugify(titleVal) || "item";
      const generatedSlug = await uniqueSlug(db, table, base, null);
      cols.push("slug");
      vals.push(generatedSlug);
      // Status
      cols.push("status");
      vals.push(form.get("_status") || "published");
      // updated_at
      cols.push("updated_at");
      vals.push(new Date().toISOString().replace("T", " ").split(".")[0]);
    }

    const placeholders = cols.map(() => "?").join(", ");
    try {
      await db.run(
        `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`,
        vals
      );
    } catch (err) {
      return errorPage(`Save failed: ${err.message}`, label, session);
    }
    return Response.redirect(`/admin/${slug}`, 302);
  }));

  // Edit form
  const editItem = requireAuth(async (req, params, session) => {
    const db = getDB();
    let item;
    try {
      item = await db.get(`SELECT * FROM ${table} WHERE id = ?`, [params.id]);
    } catch (err) {
      return errorPage(`Could not load item: ${err.message}`, label, session);
    }
    if (!item) return new Response("Not found", { status: 404 });

    const csrfToken = generateCsrfToken(session.id);
    const body = `
      <div style="margin-bottom:20px">
        <a href="/admin/${slug}" style="color:#94a3b8;text-decoration:none;font-size:14px">
          ← ${esc(label)}
        </a>
      </div>
      <div class="card">
        <h2 style="margin-bottom:24px">Edit ${esc(singularLabel)}</h2>
        <form method="POST" action="/admin/${slug}/${item.id}/edit">
          <input type="hidden" name="_csrf" value="${csrfToken}">
          ${renderFields(fields, item)}
          ${_fromDB ? renderSystemFields(systemFields, item) : ""}
          <button type="submit" class="btn btn-primary" style="margin-top:8px">Save Changes</button>
        </form>
      </div>
    `;
    return new Response(adminHTML(`Edit ${singularLabel}`, body, session), {
      headers: { "Content-Type": "text/html" },
    });
  });

  // Handle edit submission
  const handleEdit = requireAuth(csrfProtect(async (req, params, session) => {
    const form = req._form;
    const db = getDB();
    const item = await db.get(`SELECT id FROM ${table} WHERE id = ?`, [params.id]);
    if (!item) return new Response("Not found", { status: 404 });

    const setClauses = fields.map(f => `${f.name} = ?`).join(", ");
    const vals = fields.map(f => formVal(form, f));

    let finalSet = setClauses;
    let finalVals = vals;

    if (_fromDB) {
      const rawSlug = (form.get("_slug") || "").trim();
      if (rawSlug && rawSlug !== item.slug) {
        const newSlug = await uniqueSlug(db, table, slugify(rawSlug), params.id);
        finalSet += (finalSet ? ", " : "") + "slug = ?";
        finalVals.push(newSlug);
      }
      finalSet += (finalSet ? ", " : "") + "status = ?, updated_at = ?";
      finalVals.push(form.get("_status") || "published");
      finalVals.push(new Date().toISOString().replace("T", " ").split(".")[0]);
    }

    try {
      await db.run(`UPDATE ${table} SET ${finalSet} WHERE id = ?`, [...finalVals, params.id]);
    } catch (err) {
      return errorPage(`Save failed: ${err.message}`, label, session);
    }
    return Response.redirect(`/admin/${slug}`, 302);
  }));

  // Handle delete
  const handleDelete = requireAuth(csrfProtect(async (req, params, session) => {
    const db = getDB();
    await db.run(`DELETE FROM ${table} WHERE id = ?`, [params.id]);
    return Response.redirect(`/admin/${slug}`, 302);
  }));

  return { list, newItem, handleNew, editItem, handleEdit, handleDelete };
}

// ─── Field rendering ──────────────────────────────────────────────────────────

function renderSystemFields(sysFields, values) {
  return `<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
    <p style="font-size:12px;font-weight:600;color:#94a3b8;letter-spacing:.06em;margin-bottom:12px">SYSTEM FIELDS</p>
    ${sysFields.map(f => {
      const val = f.name === "_slug" ? (values.slug ?? "") : (values.status ?? "published");
      if (f.type === "select") {
        const opts = (f.options || []).map(o => `<option value="${esc(o)}" ${val === o ? "selected" : ""}>${esc(o)}</option>`).join("");
        return `<div style="margin-bottom:16px">
          <label style="display:block;font-weight:600;font-size:13px;margin-bottom:6px">${esc(f.label)}</label>
          <select name="${esc(f.name)}" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafb;font-family:inherit">${opts}</select>
        </div>`;
      }
      return `<div style="margin-bottom:16px">
        <label style="display:block;font-weight:600;font-size:13px;margin-bottom:6px">${esc(f.label)}</label>
        <input type="text" name="${esc(f.name)}" value="${esc(val)}" placeholder="${esc(f.placeholder || "")}"
          style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafb;font-family:monospace;font-size:14px">
        ${f.name === "_slug" ? `<div style="font-size:12px;color:#94a3b8;margin-top:4px">Leave empty to auto-generate from the title</div>` : ""}
      </div>`;
    }).join("")}`;
}

function renderFields(fields, values) {
  return fields.map(f => {
    const val = values[f.name] ?? f.default ?? "";

    const labelHtml = `
      <label style="display:block;font-weight:600;font-size:13px;margin-bottom:6px">
        ${esc(f.label)}${f.required ? ' <span style="color:#ef4444">*</span>' : ""}
      </label>
    `;

    if (f.type === "textarea" || f.type === "rich") {
      const isRich = f.type === "rich";
      return `<div style="margin-bottom:16px">
        ${labelHtml}
        <textarea name="${esc(f.name)}" rows="${f.rows || 5}"
          ${f.required ? "required" : ""} placeholder="${esc(f.placeholder || "")}" class="${isRich ? 'richtext' : ''}"
          style="font-size:14px; ${!isRich ? 'font-family:monospace;' : ''}">${esc(val)}</textarea>
        ${f.help ? `<div style="font-size:12px;color:#94a3b8;margin-top:4px">${esc(f.help)}</div>` : ""}
      </div>`;
    }

    if (f.type === "select") {
      const opts = (f.options || []).map(o => {
        const optVal = typeof o === "object" ? o.value : o;
        const optLabel = typeof o === "object" ? o.label : o;
        return `<option value="${esc(optVal)}" ${String(val) === String(optVal) ? "selected" : ""}>${esc(optLabel)}</option>`;
      }).join("");
      return `<div style="margin-bottom:16px">
        ${labelHtml}
        <select name="${esc(f.name)}" ${f.required ? "required" : ""}>${opts}</select>
        ${f.help ? `<div style="font-size:12px;color:#94a3b8;margin-top:4px">${esc(f.help)}</div>` : ""}
      </div>`;
    }

    if (f.type === "checkbox") {
      return `<div style="margin-bottom:16px;display:flex;align-items:center;gap:10px">
        <input type="checkbox" name="${esc(f.name)}" value="1" ${val ? "checked" : ""}
          style="width:18px;height:18px;margin:0;cursor:pointer">
        <label style="font-weight:600;font-size:13px;cursor:pointer">${esc(f.label)}</label>
        ${f.help ? `<span style="font-size:12px;color:#94a3b8">${esc(f.help)}</span>` : ""}
      </div>`;
    }

    const inputType = f.type === "number" ? "number"
      : f.type === "date" ? "date"
      : f.type === "email" ? "email"
      : f.type === "url" ? "url"
      : f.type === "color" ? "color"
      : "text";

    return `<div style="margin-bottom:16px">
      ${labelHtml}
      <input type="${inputType}" name="${esc(f.name)}" value="${esc(val)}"
        ${f.required ? "required" : ""} placeholder="${esc(f.placeholder || "")}">
      ${f.help ? `<div style="font-size:12px;color:#94a3b8;margin-top:4px">${esc(f.help)}</div>` : ""}
    </div>`;
  }).join("");
}

function formVal(form, field) {
  if (!field) return null;
  if (field.type === "checkbox") return form.get(field.name) === "1" ? 1 : 0;
  const v = form.get(field.name);
  return v === null ? (field.default ?? null) : v;
}

function fmtCell(val, field) {
  if (val === null || val === undefined) return "—";
  if (field.type === "checkbox") return val ? "Yes" : "No";
  const str = String(val);
  return str.length > 60 ? str.slice(0, 60) + "…" : str;
}

function errorPage(msg, label, session) {
  const body = `<div class="card">
    <h2 style="color:#dc2626;margin-bottom:12px">Error</h2>
    <p style="margin-bottom:16px">${esc(msg)}</p>
    <a href="/admin/${label.toLowerCase()}" class="btn btn-secondary">Back to ${esc(label)}</a>
  </div>`;
  return new Response(adminHTML(label, body, session), {
    status: 400,
    headers: { "Content-Type": "text/html" },
  });
}

function esc(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
