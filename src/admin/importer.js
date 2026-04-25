import { getDB } from "../db.js";
import { adminHTML } from "./base.js";
import { requireAuth } from "../core/auth.js";
import { csrfProtect, generateCsrfToken } from "../core/csrf.js";
import { signContent } from "../core/sanitizer.js";
import AdmZip from "adm-zip";
import { join, basename } from "path";
import { mkdirSync, writeFileSync } from "fs";

export const importComponentPage = requireAuth(async (req, params, session) => {
  const csrfToken = generateCsrfToken(session.id);
  const body = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px">
        <h2>Import Theme ZIP</h2>
        <a href="/admin/components" class="btn btn-secondary">Back to Components</a>
    </div>
    <div class="card" style="max-width:600px">
        <p style="color:var(--text-muted); font-size:15px; margin-bottom:25px; line-height:1.6">
            Upload a <strong>.zip</strong> file containing raw <code>.html</code> templates. <br><br>
            <strong>📄 Whole Pages:</strong> Files named <code>index.html</code> or <code>about.html</code> will automatically be wrapped, converted into <strong>Draft Pages</strong>, and linked up in the DB.<br><br>
            <strong>🧩 Reusable Components:</strong> Files tucked inside a <code>components/</code> folder or explicitly named <code>*.part.html</code> will be registered strictly as reusable components for the visual builder.
        </p>
        <form method="POST" action="/admin/components/import" enctype="multipart/form-data">
            <input type="hidden" name="_csrf" value="${csrfToken}">
            <div style="background:#f8fafb; border:2px dashed var(--border); padding:40px; border-radius:12px; text-align:center; margin-bottom:20px">
                <input type="file" name="zipfile" accept=".zip" required style="margin:0; background:transparent; border:none; padding:0; width:auto;">
            </div>
            <button type="submit" class="btn btn-primary" style="width:100%; font-size:16px; padding:18px">🚀 Process & Import ZIP Archive</button>
        </form>
    </div>
  `;
  return new Response(adminHTML("Import Theme ZIP", body, session), { headers: { "Content-Type": "text/html" } });
});

export const handleImportComponent = requireAuth(csrfProtect(async (req, params, session) => {
  const form = req._form;
  const db = getDB();
  const file = form.get("zipfile");
  
  if (!file || !file.name.endsWith(".zip")) {
    return new Response(adminHTML("Error", `<h2>Invalid File</h2><p>Please upload a valid .zip file.</p><a href="/admin/components/import" class="btn btn-primary">Try Again</a>`, session), { status: 400, headers: { "Content-Type": "text/html" } });
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();
    
    let importedPages = 0;
    let importedComponents = 0;

    for (const zipEntry of zipEntries) {
        if (zipEntry.isDirectory) continue;
        if (!zipEntry.name.endsWith(".html")) continue;

        // Ensure we explicitly ignore annoying MacOS bundle garbage
        if (zipEntry.entryName.includes("__MACOSX")) continue;

        const contentStr = zipEntry.getData().toString("utf8");
        const filename = zipEntry.name;
        const baseName = basename(filename, ".html");

        // Determination logic: Component vs Whole Page
        const isComponent = filename.endsWith(".part.html") || zipEntry.entryName.includes("components/");
        const internalName = isComponent ? baseName.replace(".part", "") : `${baseName}-wrapper`;
        
        // 1. Physically construct the Theme Nunjucks directory structre
        const folderName = internalName.toLowerCase().replace(/[^a-z0-9]/g, "-");
        const componentsDir = join(process.cwd(), "themes", "default", "components", folderName);
        mkdirSync(componentsDir, { recursive: true });
        // The file is saved as template.njk to fit entirely within the established Veave CMS layout system!
        writeFileSync(join(componentsDir, "template.njk"), contentStr);

        // 2. Database provision logic
        const defaultContent = "{}";
        const hmac = signContent(defaultContent);
        const compInsert = db.prepare(
            "INSERT INTO components (name, type, content, hmac_signature, is_global, created_by) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(isComponent ? internalName : `[Auto] ${internalName} Component`, isComponent ? "static" : "page-wrapper", defaultContent, hmac, 0, session.userId);

        const componentId = compInsert.lastInsertRowid;

        if (isComponent) {
            importedComponents++;
        } else {
            // WHOLE PAGE LOGIC - We automatically map it to the "drafts" of the Pages router
            let slug = baseName === "index" ? "" : baseName.toLowerCase().replace(/[^a-z0-9]/g, "-");
            
            // Check slug namespace collision and automatically append a timestamp if it clashes with a preexisting route
            const exists = db.prepare("SELECT id FROM pages WHERE slug = ?").get(slug);
            if (exists) {
                slug = slug === "" ? `home-imported-${Date.now()}` : `${slug}-imported-${Date.now()}`;
            }

            const pageInsert = db.prepare(
                "INSERT INTO pages (title, slug, status, template, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)"
            ).run(baseName, slug, "draft", "page", session.userId, session.userId);

            const pageId = pageInsert.lastInsertRowid;

            // Wire up the new Wrapper Component tightly into the newly provisioned Draft Page
            db.prepare(
                "INSERT INTO page_components (page_id, component_id, sort_order) VALUES (?, ?, ?)"
            ).run(pageId, componentId, 0);

            importedPages++;
        }
    }

    const successHTML = `
        <div class="card" style="max-width:600px; text-align:center">
            <h2 style="color:#16a34a; margin-bottom:10px">Successfully Imported Package!</h2>
            <p style="font-size:16px; margin-bottom:30px">Extracted and mapped <strong>${importedPages} draft pages</strong> and <strong>${importedComponents} reusable components</strong> into the CMS Core.</p>
            <a href="/admin/pages" class="btn btn-primary">Review Pages</a>
            <a href="/admin/components" class="btn btn-secondary">Review Components</a>
        </div>
    `;
    return new Response(adminHTML("Success", successHTML, session), { headers: { "Content-Type": "text/html" } });

  } catch (error) {
    console.error("[ZIP IMPORT ERROR]:", error);
    return new Response(adminHTML("Error", `<h2>Processing Error</h2><p style="color:#ef4444">${error.message}</p><a href="/admin/components/import" class="btn btn-primary">Try Again</a>`, session), { status: 500, headers: { "Content-Type": "text/html" } });
  }
}));
