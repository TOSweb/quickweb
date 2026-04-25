// theme.js — Nunjucks-based theme engine
import nunjucks from "nunjucks";
import { getSetting, getDB } from "../db.js";
import { join } from "path";
import { verifyAndRender } from "./sanitizer.js";
import { generateCsrfToken } from "./csrf.js";
import { processTemplateTags } from "./tags.js";
import { setFilterAdder } from "./plugins.js";

let env;

export function initTheme() {
  const themeName = getSetting("active_theme") || "default";
  const themePath = join(process.cwd(), "themes", themeName);

  env = nunjucks.configure(themePath, {
    autoescape: true,
    noCache: process.env.NODE_ENV !== "production",
  });

  // Global helpers
  env.addGlobal("site_title", () => getSetting("site_title"));
  env.addGlobal("site_tagline", () => getSetting("site_tagline"));
  env.addGlobal("site_url", () => getSetting("site_url"));
  env.addGlobal("year", () => new Date().getFullYear());
  env.addGlobal("csrf_token", (sessionId) => generateCsrfToken(sessionId));

  // Filters
  env.addFilter("date", (str, format) => {
    const d = new Date(str);
    return d.toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
  });

  env.addFilter("json_parse", (str) => {
    try { return JSON.parse(str || "{}"); } catch { return {}; }
  });

  // Allow plugins loaded after initTheme() to register Nunjucks filters
  setFilterAdder((name, fn) => env.addFilter(name, fn));

  console.log(`✓ Theme loaded: ${themeName}`);
}

// Pre-render all components for a page. Must be called before htmlResponse
// so async tag handlers (plugins, dynamic tags) can run.
export async function renderComponents(pageId, { isAdmin = false, isEditing = false, session = null, ...ctx } = {}) {
  const db = getDB();
  const components = db.prepare(`
    SELECT c.* FROM components c
    JOIN page_components pc ON c.id = pc.component_id
    WHERE pc.page_id = ?
    ORDER BY pc.sort_order ASC, c.id ASC
  `).all(pageId);

  let html = "";
  for (const comp of components) {
    const verifiedContent = verifyAndRender(comp.content, comp.hmac_signature);
    if (!verifiedContent && verifiedContent !== "") {
      html += `<!-- component #${comp.id} signature invalid — skipped -->`;
      continue;
    }

    try {
      let compHtml = "";

      if (comp.type === "dynamic") {
        // Dynamic: content is a tag string like {% recentposts limit=5 %}
        compHtml = await processTemplateTags(comp.content, { ...ctx, isAdmin, isEditing, session });
      } else {
        // Static: content is JSON of editable field values; render via Nunjucks template
        let contentData = {};
        try { contentData = JSON.parse(comp.content); } catch {}

        try {
          compHtml = env.render(`components/${comp.name}/template.njk`, { ...contentData, _comp: comp, isAdmin, isEditing });
        } catch {
          compHtml = env.render(`components/${comp.name}.html`, { ...contentData, _comp: comp, isAdmin, isEditing });
        }
      }

      html += isEditing
        ? `<div data-component-id="${comp.id}" class="cms-component-wrap">${compHtml}</div>`
        : compHtml;

    } catch (err) {
      console.error(`Component #${comp.id} render error:`, err.message);
      html += `<div style="padding:20px;background:#fef2f2;color:#991b1b;border:1px solid #fee2e2">
        Template error in component <strong>${comp.name}</strong></div>`;
    }
  }

  if (isAdmin && isEditing) {
    html += `<script src="/admin/static/inline-editor.js"></script>`;
  }
  return html;
}

export function render(template, context = {}) {
  if (!env) throw new Error("Theme not initialized.");
  return env.render(template + ".html", context);
}

export function htmlResponse(template, context = {}, status = 200) {
  const html = render(template, context);
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
