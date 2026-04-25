// src/admin/plugins.js
import { adminHTML } from "./base.js";
import { requireAuth } from "../core/auth.js";
import { csrfProtect, generateCsrfToken } from "../core/csrf.js";
import { join, extname } from "path";
import { readdirSync, existsSync, rmSync, mkdirSync } from "fs";
import { readFileSync } from "fs";

function pluginsDir() {
  return join(process.cwd(), "plugins");
}

function getInstalledPlugins() {
  const dir = pluginsDir();
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(entry => {
      const pluginDir = join(dir, entry.name);
      let meta = { name: entry.name, version: "—", description: "", author: "" };

      for (const fname of ["plugin.json", "package.json"]) {
        const fpath = join(pluginDir, fname);
        if (existsSync(fpath)) {
          try {
            const data = JSON.parse(readFileSync(fpath, "utf8"));
            meta = {
              name: data.displayName || data.name || entry.name,
              version: data.version || "—",
              description: data.description || "",
              author: typeof data.author === "string" ? data.author : (data.author?.name || ""),
            };
            break;
          } catch {}
        }
      }

      const active = existsSync(join(pluginDir, "index.js"));
      return { folder: entry.name, ...meta, active };
    });
}

// ─── List ─────────────────────────────────────────────────────────────────────

export const pluginsList = requireAuth(async (req, params, session) => {
  const plugins = getInstalledPlugins();
  const csrfToken = generateCsrfToken(session.id);
  const url = new URL(req.url);
  const justInstalled = url.searchParams.get("installed");
  const justDeleted = url.searchParams.get("deleted");
  const installError = url.searchParams.get("error");

  const rows = plugins.length
    ? plugins.map(p => `
      <tr>
        <td>
          <div style="font-weight:600">${esc(p.name)}</div>
          <div style="font-size:12px;color:#94a3b8;margin-top:2px">Folder: <code>${esc(p.folder)}</code></div>
        </td>
        <td><code style="font-size:12px;color:#64748b">${esc(p.version)}</code></td>
        <td style="max-width:280px;font-size:13px;color:#64748b">${esc(p.description)}</td>
        <td style="font-size:12px;color:#94a3b8">${esc(p.author)}</td>
        <td>
          ${p.active
            ? `<span class="badge badge-success">Active</span>`
            : `<span class="badge" style="background:#fef9c3;color:#854d0e">No index.js</span>`}
        </td>
        <td>
          <form method="POST" action="/admin/plugins/${esc(p.folder)}/delete"
            onsubmit="return confirm('Delete plugin “${esc(p.name)}”? This cannot be undone.')">
            <input type="hidden" name="_csrf" value="${csrfToken}">
            <button type="submit" class="btn btn-secondary"
              style="padding:5px 14px;font-size:12px;color:#ef4444">Delete</button>
          </form>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:50px">
        No plugins installed yet
      </td></tr>`;

  const body = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h2>Plugins</h2>
    </div>

    ${(justInstalled || justDeleted) ? `
    <div style="background:#fef3c7;color:#92400e;padding:14px 20px;border-radius:12px;margin-bottom:20px;font-size:14px;font-weight:500">
      ⚠ Plugin ${justInstalled ? "installed" : "removed"}.
      <strong>Restart the server</strong> for the change to take effect.
    </div>` : ""}

    ${installError ? `
    <div style="background:#fef2f2;color:#991b1b;padding:14px 20px;border-radius:12px;margin-bottom:20px;font-size:14px">
      ${esc(decodeURIComponent(installError))}
    </div>` : ""}

    <div class="card" style="margin-bottom:24px">
      <div style="font-weight:700;font-size:14px;margin-bottom:4px">Install Plugin</div>
      <div style="font-size:13px;color:#94a3b8;margin-bottom:16px">
        Upload a <code>.zip</code> file. The zip must contain a single top-level folder
        with an <code>index.js</code> inside that exports a <code>register()</code> function.
      </div>
      <form method="POST" action="/admin/plugins/upload" enctype="multipart/form-data" id="plugin-upload-form">
        <input type="hidden" name="_csrf" value="${csrfToken}">
        <div id="plugin-drop-zone"
          style="border:2px dashed #e2e8f0;border-radius:16px;padding:32px;text-align:center;cursor:pointer;transition:0.2s"
          onclick="document.getElementById('plugin-file-input').click()">
          <div style="font-size:28px;margin-bottom:8px">🔌</div>
          <div style="font-weight:600;margin-bottom:4px">Drop plugin .zip here or click to browse</div>
          <div style="font-size:12px;color:#94a3b8">Only .zip files accepted · Max 20MB</div>
          <input type="file" id="plugin-file-input" name="plugin" accept=".zip" style="display:none"
            onchange="this.form.submit()">
        </div>
      </form>
    </div>

    <div class="card">
      <table>
        <thead>
          <tr>
            <th>Plugin</th>
            <th>Version</th>
            <th>Description</th>
            <th>Author</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <script>
      const dz = document.getElementById('plugin-drop-zone');
      dz.addEventListener('dragover', e => {
        e.preventDefault();
        dz.style.borderColor = '#154d37';
        dz.style.background = '#e9f5ef';
      });
      dz.addEventListener('dragleave', () => {
        dz.style.borderColor = '#e2e8f0';
        dz.style.background = '';
      });
      dz.addEventListener('drop', e => {
        e.preventDefault();
        dz.style.borderColor = '#e2e8f0';
        dz.style.background = '';
        const dt = new DataTransfer();
        [...e.dataTransfer.files].forEach(f => dt.items.add(f));
        document.getElementById('plugin-file-input').files = dt.files;
        document.getElementById('plugin-upload-form').submit();
      });
    </script>
  `;

  return new Response(adminHTML("Plugins", body, session), {
    headers: { "Content-Type": "text/html" },
  });
});

// ─── Upload ───────────────────────────────────────────────────────────────────

export const handlePluginUpload = requireAuth(async (req, params, session) => {
  const form = req._form;
  if (!form) return new Response("No form data", { status: 400 });

  const { verifyCsrfToken } = await import("../core/csrf.js");
  if (!verifyCsrfToken(form.get("_csrf"), session.id)) {
    return new Response("Invalid request (CSRF)", { status: 403 });
  }

  const file = form.get("plugin");
  if (!file || !file.name) return redirectWithError("No file uploaded.");
  if (extname(file.name).toLowerCase() !== ".zip") {
    return redirectWithError("Only .zip files are accepted.");
  }
  const maxBytes = 20 * 1024 * 1024;
  if (file.size > maxBytes) return redirectWithError("Plugin zip too large (max 20MB).");

  const dataDir = join(process.cwd(), "data");
  const tmpPath = join(dataDir, `plugin-upload-${Date.now()}.zip`);
  const plugDir = pluginsDir();

  try {
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(plugDir, { recursive: true });

    const buffer = await file.arrayBuffer();
    await Bun.write(tmpPath, buffer);

    const proc = Bun.spawn(["unzip", "-q", "-o", tmpPath, "-d", plugDir], {
      stderr: "pipe",
    });
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      return redirectWithError("Failed to extract zip. Make sure it is a valid .zip file.");
    }

    return Response.redirect("/admin/plugins?installed=1", 302);
  } catch (err) {
    console.error("Plugin upload error:", err);
    return redirectWithError(`Upload failed: ${err.message}`);
  } finally {
    try { if (existsSync(tmpPath)) rmSync(tmpPath); } catch {}
  }
});

// ─── Delete ───────────────────────────────────────────────────────────────────

export const handleDeletePlugin = requireAuth(csrfProtect(async (req, params, session) => {
  const folderName = params.folder;
  if (!folderName || /[/\\.]/.test(folderName)) {
    return new Response("Invalid plugin name", { status: 400 });
  }

  const targetDir = join(pluginsDir(), folderName);
  if (!existsSync(targetDir)) return new Response("Plugin not found", { status: 404 });

  try {
    rmSync(targetDir, { recursive: true, force: true });
  } catch (err) {
    return redirectWithError(`Failed to delete plugin: ${err.message}`);
  }

  return Response.redirect("/admin/plugins?deleted=1", 302);
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function redirectWithError(msg) {
  return Response.redirect(`/admin/plugins?error=${encodeURIComponent(msg)}`, 302);
}

function esc(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
