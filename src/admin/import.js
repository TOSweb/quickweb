// src/admin/import.js — import HTML files as page or component templates
import { adminHTML } from "./base.js";
import { requireAuth } from "../core/auth.js";
import { csrfProtect, generateCsrfToken } from "../core/csrf.js";
import { getDB, getSetting } from "../db.js";
import { join, extname, basename } from "path";
import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync, rmSync } from "fs";
import { readFileSync } from "fs";

// ─── Import page ──────────────────────────────────────────────────────────────

export const importPage = requireAuth(async (req, params, session) => {
  const url = new URL(req.url);
  const imported = url.searchParams.get("imported");
  const error = url.searchParams.get("error");
  const csrfToken = generateCsrfToken(session.id);

  const body = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <div>
        <h2>Import HTML</h2>
        <p style="color:#94a3b8;font-size:14px;margin-top:4px">
          Convert static HTML/CSS/JS into CMS page templates and component templates.
          <a href="/docs/HTML_TO_CMS.md" target="_blank" style="color:#154d37">Read the conversion guide →</a>
        </p>
      </div>
    </div>

    ${imported ? `<div style="background:#d1fae5;color:#065f46;padding:14px 20px;border-radius:12px;margin-bottom:20px;font-size:14px;font-weight:500">
      ✅ ${esc(decodeURIComponent(imported))}
    </div>` : ""}

    ${error ? `<div style="background:#fef2f2;color:#991b1b;padding:14px 20px;border-radius:12px;margin-bottom:20px;font-size:14px">
      ${esc(decodeURIComponent(error))}
    </div>` : ""}

    <!-- ── Single file ── -->
    <div class="card" style="margin-bottom:24px">
      <div style="font-weight:700;font-size:16px;margin-bottom:4px">Single File Import</div>
      <div style="font-size:13px;color:#94a3b8;margin-bottom:20px">
        Import one <code>.html</code> file as a page template or component template.
      </div>

      <form method="POST" action="/admin/developer/import/single" enctype="multipart/form-data">
        <input type="hidden" name="_csrf" value="${csrfToken}">

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
          <div>
            <label style="display:block;font-weight:600;font-size:13px;margin-bottom:6px">
              Import as <span style="color:#ef4444">*</span>
            </label>
            <select name="type" required>
              <option value="page">Page Template</option>
              <option value="component">Component Template</option>
            </select>
          </div>
          <div>
            <label style="display:block;font-weight:600;font-size:13px;margin-bottom:6px">
              Name / Slug <span style="color:#ef4444">*</span>
            </label>
            <input type="text" name="name" required
              placeholder="e.g. about or hero-banner"
              pattern="[a-z0-9][a-z0-9-]*"
              title="Lowercase letters, numbers, and dashes only">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
          <div>
            <label style="display:block;font-weight:600;font-size:13px;margin-bottom:6px">HTML File <span style="color:#ef4444">*</span></label>
            <div id="single-drop-zone"
              style="border:2px dashed #e2e8f0;border-radius:12px;padding:24px;text-align:center;cursor:pointer;transition:0.2s"
              onclick="document.getElementById('single-file').click()">
              <div style="font-size:22px;margin-bottom:6px">📄</div>
              <div style="font-weight:600;font-size:13px;margin-bottom:2px">Drop .html file or click to browse</div>
              <div id="single-file-name" style="font-size:12px;color:#94a3b8">No file chosen</div>
              <input type="file" id="single-file" name="file" accept=".html,.htm" style="display:none"
                onchange="document.getElementById('single-file-name').textContent = this.files[0]?.name || 'No file chosen'">
            </div>
          </div>

          <div style="display:flex;flex-direction:column;justify-content:center;gap:14px;padding-top:20px">
            <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer">
              <input type="checkbox" name="inject_cms" value="1" checked
                style="width:16px;height:16px;margin-top:2px;flex-shrink:0">
              <span>
                <strong style="font-size:13px">Inject CMS variables</strong>
                <div style="font-size:12px;color:#94a3b8;margin-top:2px">
                  Adds <code>{{ seo_head | safe }}</code> and CMS title to the page
                </div>
              </span>
            </label>
            <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer">
              <input type="checkbox" name="add_comp_slot" value="1"
                style="width:16px;height:16px;margin-top:2px;flex-shrink:0">
              <span>
                <strong style="font-size:13px">Add components slot</strong>
                <div style="font-size:12px;color:#94a3b8;margin-top:2px">
                  Injects <code>{{ components_html | safe }}</code> into the page body
                </div>
              </span>
            </label>
          </div>
        </div>

        <button type="submit" class="btn btn-primary">Import File</button>
      </form>
    </div>

    <!-- ── Batch zip ── -->
    <div class="card">
      <div style="font-weight:700;font-size:16px;margin-bottom:4px">Batch Import from Zip</div>
      <div style="font-size:13px;color:#94a3b8;margin-bottom:16px">
        Upload a <code>.zip</code> file containing multiple HTML files and assets.
        The zip must follow this folder structure:
      </div>

      <div style="background:#1e293b;color:#94a3b8;border-radius:12px;padding:16px 20px;font-family:monospace;font-size:13px;line-height:1.8;margin-bottom:20px">
        <span style="color:#f1f5f9">my-site.zip</span><br>
        ├── <span style="color:#86efac">pages/</span><br>
        │   ├── about.html &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color:#64748b">→ page template + draft page in DB</span><br>
        │   └── contact.html<br>
        ├── <span style="color:#93c5fd">components/</span><br>
        │   ├── hero.html &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color:#64748b">→ component template file</span><br>
        │   └── features.html<br>
        └── <span style="color:#fcd34d">assets/</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color:#64748b">→ copied to themes/assets/imported/</span><br>
        &nbsp;&nbsp;&nbsp; ├── style.css<br>
        &nbsp;&nbsp;&nbsp; └── main.js
      </div>

      <form method="POST" action="/admin/developer/import/batch" enctype="multipart/form-data">
        <input type="hidden" name="_csrf" value="${csrfToken}">

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
          <div>
            <label style="display:block;font-weight:600;font-size:13px;margin-bottom:6px">Zip File <span style="color:#ef4444">*</span></label>
            <div id="batch-drop-zone"
              style="border:2px dashed #e2e8f0;border-radius:12px;padding:24px;text-align:center;cursor:pointer;transition:0.2s"
              onclick="document.getElementById('batch-file').click()">
              <div style="font-size:22px;margin-bottom:6px">📦</div>
              <div style="font-weight:600;font-size:13px;margin-bottom:2px">Drop .zip file or click to browse</div>
              <div id="batch-file-name" style="font-size:12px;color:#94a3b8">No file chosen</div>
              <input type="file" id="batch-file" name="zipfile" accept=".zip" style="display:none"
                onchange="document.getElementById('batch-file-name').textContent = this.files[0]?.name || 'No file chosen'">
            </div>
          </div>

          <div style="display:flex;flex-direction:column;justify-content:center;gap:14px;padding-top:20px">
            <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer">
              <input type="checkbox" name="inject_cms" value="1" checked
                style="width:16px;height:16px;margin-top:2px;flex-shrink:0">
              <span>
                <strong style="font-size:13px">Inject CMS variables into pages</strong>
                <div style="font-size:12px;color:#94a3b8;margin-top:2px">Recommended — adds seo_head, title, CSRF</div>
              </span>
            </label>
            <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer">
              <input type="checkbox" name="add_comp_slot" value="1"
                style="width:16px;height:16px;margin-top:2px;flex-shrink:0">
              <span>
                <strong style="font-size:13px">Add components slot to pages</strong>
              </span>
            </label>
          </div>
        </div>

        <button type="submit" class="btn btn-primary">Import Zip</button>
      </form>
    </div>

    <script>
      function setupDropZone(zoneId, inputId) {
        const dz = document.getElementById(zoneId);
        const inp = document.getElementById(inputId);
        dz.addEventListener('dragover', e => { e.preventDefault(); dz.style.borderColor='#154d37'; dz.style.background='#e9f5ef'; });
        dz.addEventListener('dragleave', () => { dz.style.borderColor='#e2e8f0'; dz.style.background=''; });
        dz.addEventListener('drop', e => {
          e.preventDefault(); dz.style.borderColor='#e2e8f0'; dz.style.background='';
          if (e.dataTransfer.files[0]) {
            const dt = new DataTransfer();
            dt.items.add(e.dataTransfer.files[0]);
            inp.files = dt.files;
            inp.dispatchEvent(new Event('change'));
          }
        });
      }
      setupDropZone('single-drop-zone', 'single-file');
      setupDropZone('batch-drop-zone', 'batch-file');
    </script>
  `;

  return new Response(adminHTML("Import HTML", body, session), {
    headers: { "Content-Type": "text/html" },
  });
});

// ─── Single file import ───────────────────────────────────────────────────────

export const handleSingleImport = requireAuth(async (req, params, session) => {
  const form = req._form;
  if (!form) return new Response("No form data", { status: 400 });

  const { verifyCsrfToken } = await import("../core/csrf.js");
  if (!verifyCsrfToken(form.get("_csrf"), session.id)) {
    return new Response("Invalid request (CSRF)", { status: 403 });
  }

  const type = form.get("type");          // "page" or "component"
  const rawName = form.get("name") || "";
  const name = rawName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const injectCms = form.get("inject_cms") === "1";
  const addCompSlot = form.get("add_comp_slot") === "1";

  if (!name) return redirectErr("Name is required.");
  if (!["page", "component"].includes(type)) return redirectErr("Invalid import type.");

  const file = form.get("file");
  if (!file || !file.name) return redirectErr("No file uploaded.");
  const ext = extname(file.name).toLowerCase();
  if (ext !== ".html" && ext !== ".htm") return redirectErr("Only .html files are accepted.");

  let html = await file.text();

  const theme = getSetting("active_theme") || "default";
  const themePath = join(process.cwd(), "themes", theme);

  try {
    if (type === "page") {
      if (injectCms) html = injectCmsVars(html, { addCompSlot });
      const destPath = join(themePath, `${name}.html`);
      if (existsSync(destPath)) return redirectErr(`Page template "${name}.html" already exists. Choose a different name.`);
      writeFileSync(destPath, html, "utf-8");

      // Extract title from HTML for the DB record
      const title = extractTitle(html) || titleCase(name);
      await createPageRecord(name, title, name, session.userId);

      return redirectOk(`Page template "${name}" imported. A draft page was created — go to Pages to publish it.`);
    } else {
      const dir = join(themePath, "components", name);
      if (existsSync(dir)) return redirectErr(`Component template "${name}" already exists. Choose a different name.`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "template.njk"), html, "utf-8");

      return redirectOk(`Component template "${name}" imported. Go to Components → New Component to create an instance.`);
    }
  } catch (err) {
    console.error("Import error:", err);
    return redirectErr(`Import failed: ${err.message}`);
  }
});

// ─── Batch zip import ─────────────────────────────────────────────────────────

export const handleBatchImport = requireAuth(async (req, params, session) => {
  const form = req._form;
  if (!form) return new Response("No form data", { status: 400 });

  const { verifyCsrfToken } = await import("../core/csrf.js");
  if (!verifyCsrfToken(form.get("_csrf"), session.id)) {
    return new Response("Invalid request (CSRF)", { status: 403 });
  }

  const file = form.get("zipfile");
  if (!file || !file.name) return redirectErr("No zip file uploaded.");
  if (extname(file.name).toLowerCase() !== ".zip") return redirectErr("Only .zip files are accepted.");

  const maxBytes = 50 * 1024 * 1024;
  if (file.size > maxBytes) return redirectErr("Zip too large (max 50MB).");

  const injectCms = form.get("inject_cms") === "1";
  const addCompSlot = form.get("add_comp_slot") === "1";

  const theme = getSetting("active_theme") || "default";
  const themePath = join(process.cwd(), "themes", theme);
  const tmpDir = join(process.cwd(), "data", `import-${Date.now()}`);
  const tmpZip = `${tmpDir}.zip`;

  const results = { pages: [], components: [], assets: [], errors: [] };

  try {
    mkdirSync(join(process.cwd(), "data"), { recursive: true });

    const buffer = await file.arrayBuffer();
    await Bun.write(tmpZip, buffer);

    mkdirSync(tmpDir, { recursive: true });
    const proc = Bun.spawn(["unzip", "-q", "-o", tmpZip, "-d", tmpDir], { stderr: "pipe" });
    const exitCode = await proc.exited;
    if (exitCode !== 0) return redirectErr("Failed to extract zip. Make sure it is a valid .zip file.");

    // Walk the extracted directory
    const files = walkDir(tmpDir);

    for (const absPath of files) {
      const rel = absPath.slice(tmpDir.length + 1).replace(/\\/g, "/");

      // Skip __MACOSX and hidden files
      if (rel.startsWith("__MACOSX") || rel.includes("/.")) continue;

      const ext = extname(rel).toLowerCase();
      const inPages = rel.startsWith("pages/");
      const inComponents = rel.startsWith("components/");
      const inAssets = rel.startsWith("assets/");

      if (inPages && (ext === ".html" || ext === ".htm")) {
        const rawName = basename(rel, ext);
        const name = rawName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        try {
          let html = readFileSync(absPath, "utf-8");
          if (injectCms) html = injectCmsVars(html, { addCompSlot });
          const dest = join(themePath, `${name}.html`);
          if (existsSync(dest)) {
            results.errors.push(`pages/${basename(rel)}: template "${name}.html" already exists — skipped`);
            continue;
          }
          writeFileSync(dest, html, "utf-8");
          const title = extractTitle(html) || titleCase(name);
          await createPageRecord(name, title, name, session.userId);
          results.pages.push(name);
        } catch (err) {
          results.errors.push(`pages/${basename(rel)}: ${err.message}`);
        }

      } else if (inComponents && (ext === ".html" || ext === ".htm" || ext === ".njk")) {
        const rawName = basename(rel, ext);
        const name = rawName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        try {
          const html = readFileSync(absPath, "utf-8");
          const dir = join(themePath, "components", name);
          if (existsSync(dir)) {
            results.errors.push(`components/${basename(rel)}: template "${name}" already exists — skipped`);
            continue;
          }
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, "template.njk"), html, "utf-8");
          results.components.push(name);
        } catch (err) {
          results.errors.push(`components/${basename(rel)}: ${err.message}`);
        }

      } else if (inAssets || (!inPages && !inComponents && [".css", ".js", ".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif", ".woff", ".woff2", ".ttf"].includes(ext))) {
        // Copy asset file preserving relative structure
        const assetRel = inAssets ? rel.slice("assets/".length) : rel;
        const destPath = join(themePath, "assets", "imported", assetRel);
        try {
          mkdirSync(join(destPath, ".."), { recursive: true });
          writeFileSync(destPath, readFileSync(absPath));
          results.assets.push(assetRel);
        } catch (err) {
          results.errors.push(`asset ${assetRel}: ${err.message}`);
        }
      }
    }

    return showBatchResults(results, session);

  } catch (err) {
    console.error("Batch import error:", err);
    return redirectErr(`Import failed: ${err.message}`);
  } finally {
    try { if (existsSync(tmpZip)) rmSync(tmpZip); } catch {}
    try { if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
});

// ─── Results page ─────────────────────────────────────────────────────────────

function showBatchResults(results, session) {
  const total = results.pages.length + results.components.length;

  const body = `
    <div style="margin-bottom:20px">
      <a href="/admin/developer/import" style="color:#94a3b8;text-decoration:none;font-size:14px">← Import</a>
    </div>
    <h2 style="margin-bottom:20px">Import Results</h2>

    ${total === 0 && results.errors.length === 0 ? `
    <div class="card" style="text-align:center;color:#94a3b8;padding:40px">
      No HTML files found. Check your zip uses the <code>pages/</code> and <code>components/</code> folder structure.
    </div>` : ""}

    ${results.pages.length ? `
    <div class="card" style="margin-bottom:16px">
      <div style="font-weight:700;margin-bottom:12px;color:#065f46">
        ✅ ${results.pages.length} Page Template${results.pages.length > 1 ? "s" : ""} Imported
      </div>
      ${results.pages.map(p => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:14px">
          <span><code>${esc(p)}.html</code> — draft page created</span>
          <a href="/admin/pages" class="btn btn-secondary" style="padding:4px 12px;font-size:12px">Go to Pages</a>
        </div>
      `).join("")}
      <div style="margin-top:12px;font-size:13px;color:#64748b">
        Draft pages were created. Go to <a href="/admin/pages" style="color:#154d37">Pages</a> to publish them.
      </div>
    </div>` : ""}

    ${results.components.length ? `
    <div class="card" style="margin-bottom:16px">
      <div style="font-weight:700;margin-bottom:12px;color:#0369a1">
        ✅ ${results.components.length} Component Template${results.components.length > 1 ? "s" : ""} Imported
      </div>
      ${results.components.map(c => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:14px">
          <span><code>components/${esc(c)}/template.njk</code></span>
          <a href="/admin/components/new" class="btn btn-secondary" style="padding:4px 12px;font-size:12px">Create Instance</a>
        </div>
      `).join("")}
      <div style="margin-top:12px;font-size:13px;color:#64748b">
        Template files were created. Go to <a href="/admin/components/new" style="color:#154d37">New Component</a>
        and enter the template name to create an instance you can add to pages.
      </div>
    </div>` : ""}

    ${results.assets.length ? `
    <div class="card" style="margin-bottom:16px">
      <div style="font-weight:700;margin-bottom:12px;color:#92400e">
        📦 ${results.assets.length} Asset${results.assets.length > 1 ? "s" : ""} Copied
      </div>
      <div style="font-size:13px;color:#64748b">
        Saved to <code>themes/{active}/assets/imported/</code>. Reference them in templates as
        <code>/assets/imported/your-file.css</code>.
      </div>
    </div>` : ""}

    ${results.errors.length ? `
    <div class="card" style="margin-bottom:16px;border-left:3px solid #ef4444">
      <div style="font-weight:700;margin-bottom:12px;color:#991b1b">
        ⚠ ${results.errors.length} Error${results.errors.length > 1 ? "s" : ""}
      </div>
      ${results.errors.map(e => `<div style="font-size:13px;color:#64748b;padding:4px 0">${esc(e)}</div>`).join("")}
    </div>` : ""}

    <a href="/admin/developer/import" class="btn btn-secondary" style="margin-top:8px">Import More</a>
  `;

  return new Response(adminHTML("Import Results", body, session), {
    headers: { "Content-Type": "text/html" },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function injectCmsVars(html, { addCompSlot = false } = {}) {
  let out = html;

  // Replace <title>...</title> with CMS variable
  out = out.replace(/<title>[^<]*<\/title>/i,
    `<title>{{ page.meta_title or page.title }} — {{ site_title() }}</title>`);

  // Inject {{ seo_head | safe }} before </head> if not already present
  if (!out.includes("seo_head")) {
    out = out.replace(/<\/head>/i, `  {{ seo_head | safe }}\n</head>`);
  }

  // Inject components slot
  if (addCompSlot && !out.includes("components_html")) {
    // Prefer inserting before </main>, fallback to </body>
    if (/<\/main>/i.test(out)) {
      out = out.replace(/<\/main>/i, `  {{ components_html | safe }}\n</main>`);
    } else {
      out = out.replace(/<\/body>/i, `  {{ components_html | safe }}\n</body>`);
    }
  }

  // Inject inline editor CSRF before </body>
  if (!out.includes("CSRF_TOKEN")) {
    out = out.replace(/<\/body>/i,
      `  {% if isAdmin and isEditing %}<script>window.CSRF_TOKEN = "{{ csrf_token(session.id) }}";</script>{% endif %}\n</body>`);
  }

  return out;
}

function extractTitle(html) {
  const m = html.match(/<title>([^<]*)<\/title>/i);
  return m ? m[1].trim().replace(/\s*[—|-].*$/, "").trim() : null;
}

function titleCase(slug) {
  return slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

async function createPageRecord(slug, title, template, userId) {
  const db = getDB();
  // Don't overwrite if a page with this slug already exists
  const existing = await db.get("SELECT id FROM pages WHERE slug = ?", [slug]);
  if (existing) return;
  await db.run(
    `INSERT INTO pages (title, slug, template, status, created_by, updated_by) VALUES (?, ?, ?, 'draft', ?, ?)`,
    [title, slug, template, userId, userId]
  );
}

function walkDir(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkDir(full));
    else results.push(full);
  }
  return results;
}

function redirectOk(msg) {
  return Response.redirect(`/admin/developer/import?imported=${encodeURIComponent(msg)}`, 302);
}

function redirectErr(msg) {
  return Response.redirect(`/admin/developer/import?error=${encodeURIComponent(msg)}`, 302);
}

function esc(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
