// src/admin/media.js
import { getDB } from "../db.js";
import { adminHTML } from "./base.js";
import { requireAuth } from "../core/auth.js";
import { csrfProtect, generateCsrfToken } from "../core/csrf.js";
import config from "../config.js";
import { join, extname } from "path";
import { mkdirSync, unlinkSync, existsSync } from "fs";

const MAGIC_BYTES = {
  "image/jpeg":      [[0xFF, 0xD8, 0xFF]],
  "image/png":       [[0x89, 0x50, 0x4E, 0x47]],
  "image/webp":      [[0x52, 0x49, 0x46, 0x46]],
  "image/gif":       [[0x47, 0x49, 0x46, 0x38]],
  "image/svg+xml":   null,
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]],
};

async function validateUpload(file) {
  const maxBytes = (config.uploads.maxSizeMb || 10) * 1024 * 1024;
  if (file.size > maxBytes) throw new Error(`File too large. Max ${config.uploads.maxSizeMb}MB.`);

  const allowed = config.uploads.allowedMimeTypes || [];
  if (!allowed.includes(file.type)) throw new Error(`File type not allowed: ${file.type}`);

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer.slice(0, 8));
  const magicList = MAGIC_BYTES[file.type];

  if (magicList) {
    const matched = magicList.some(magic => magic.every((b, i) => bytes[i] === b));
    if (!matched) throw new Error("File content does not match declared type.");
  }

  const ext = extname(file.name).toLowerCase().replace(/[^a-z0-9.]/g, "");
  const safeName = `${crypto.randomUUID()}${ext}`;

  return { safeName, buffer, mimeType: file.type, originalName: file.name, size: file.size };
}

// ─── Media Library ────────────────────────────────────────────────────────────

export const mediaLibrary = requireAuth(async (req, params, session) => {
  const db = getDB();
  const items = await db.all("SELECT * FROM media ORDER BY uploaded_at DESC");
  const csrfToken = generateCsrfToken(session.id);

  const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];

  const grid = items.map(m => {
    const isImage = IMAGE_TYPES.includes(m.mime_type);
    const thumb = isImage
      ? `<img src="${esc(m.url)}" alt="${esc(m.alt_text || m.original_name)}" style="width:100%;height:140px;object-fit:cover;border-radius:10px 10px 0 0">`
      : `<div style="width:100%;height:140px;display:flex;align-items:center;justify-content:center;background:#f8fafc;border-radius:10px 10px 0 0;font-size:36px">${fileIcon(m.mime_type)}</div>`;

    return `
      <div style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
        ${thumb}
        <div style="padding:10px">
          <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:4px">${esc(m.original_name)}</div>
          <div style="font-size:11px;color:#94a3b8;margin-bottom:8px">${fmtSize(m.size)} · ${m.mime_type.split("/")[1]}</div>
          <div style="display:flex;gap:6px">
            <button onclick="copyUrl('${esc(m.url)}')" class="btn btn-secondary" style="flex:1;padding:5px;font-size:11px">Copy URL</button>
            <form method="POST" action="/admin/media/${m.id}/delete" onsubmit="return confirm('Delete?')" style="flex:1">
              <input type="hidden" name="_csrf" value="${csrfToken}">
              <button type="submit" class="btn btn-secondary" style="width:100%;padding:5px;font-size:11px;color:#ef4444">Delete</button>
            </form>
          </div>
        </div>
      </div>
    `;
  }).join("");

  const body = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h2>Media Library</h2>
    </div>

    <div class="card" style="margin-bottom:24px">
      <div style="font-weight:700;font-size:14px;margin-bottom:15px">Upload Files</div>
      <div id="drop-zone" style="border:2px dashed #e2e8f0;border-radius:16px;padding:48px 40px;text-align:center;cursor:pointer;transition:background .15s,border-color .15s">
        <div style="font-size:36px;margin-bottom:12px;pointer-events:none">☁️</div>
        <div style="font-weight:600;font-size:15px;margin-bottom:4px;pointer-events:none">Click to browse or drag &amp; drop files here</div>
        <div style="font-size:13px;color:#94a3b8;pointer-events:none">JPEG, PNG, WebP, GIF, SVG, PDF · Max ${config.uploads.maxSizeMb}MB each</div>
        <input type="file" id="file-input" multiple accept="${(config.uploads.allowedMimeTypes || []).join(",")}" style="display:none">
      </div>
      <div id="file-queue" style="margin-top:12px;display:none"></div>
    </div>

    ${items.length ? `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px">
      ${grid}
    </div>
    ` : `<div class="card" style="text-align:center;color:#94a3b8;padding:60px">No media uploaded yet</div>`}

    <script>
      const CSRF_TOKEN = '${csrfToken}';
      let uploadTotal = 0, uploadDone = 0;

      const dz = document.getElementById('drop-zone');
      const fi = document.getElementById('file-input');
      const fq = document.getElementById('file-queue');

      dz.onclick = () => fi.click();
      fi.addEventListener('change', () => { queueFiles(fi.files); fi.value = ''; });

      dz.addEventListener('dragover', e => {
        e.preventDefault();
        dz.style.borderColor = '#154d37';
        dz.style.background = '#f0fdf4';
      });
      dz.addEventListener('dragleave', e => {
        if (!dz.contains(e.relatedTarget)) {
          dz.style.borderColor = '#e2e8f0';
          dz.style.background = '';
        }
      });
      dz.addEventListener('drop', e => {
        e.preventDefault();
        dz.style.borderColor = '#e2e8f0';
        dz.style.background = '';
        queueFiles(e.dataTransfer.files);
      });

      function queueFiles(files) {
        for (const file of files) startUpload(file);
      }

      function startUpload(file) {
        uploadTotal++;
        fq.style.display = 'block';

        const rowId = 'row-' + Math.random().toString(36).slice(2);
        const icon = file.type.startsWith('image/') ? '🖼' : '📄';
        const row = document.createElement('div');
        row.id = rowId;
        row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 14px;background:#f8fafc;border-radius:10px;margin-bottom:8px;border:1px solid #e2e8f0';
        row.innerHTML =
          '<div style="font-size:22px;flex-shrink:0">' + icon + '</div>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _esc(file.name) + '</div>' +
            '<div style="font-size:11px;color:#94a3b8;margin-bottom:5px">' + _fmt(file.size) + '</div>' +
            '<div style="height:4px;background:#e2e8f0;border-radius:4px;overflow:hidden">' +
              '<div class="prog" style="height:100%;width:0;background:#154d37;transition:width .15s"></div>' +
            '</div>' +
          '</div>' +
          '<div class="status" style="font-size:12px;font-weight:600;color:#94a3b8;white-space:nowrap;min-width:70px;text-align:right">Uploading…</div>';
        fq.appendChild(row);

        const fill = row.querySelector('.prog');
        const status = row.querySelector('.status');

        const fd = new FormData();
        fd.append('_csrf', CSRF_TOKEN);
        fd.append('file', file);

        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) fill.style.width = (e.loaded / e.total * 100) + '%';
        };
        xhr.onload = () => {
          fill.style.width = '100%';
          if (xhr.status < 300) {
            fill.style.background = '#16a34a';
            status.style.color = '#16a34a';
            status.textContent = '✓ Done';
          } else {
            fill.style.background = '#ef4444';
            status.style.color = '#ef4444';
            status.textContent = '✗ Failed';
          }
          onUploadComplete();
        };
        xhr.onerror = () => {
          fill.style.background = '#ef4444';
          status.style.color = '#ef4444';
          status.textContent = '✗ Error';
          onUploadComplete();
        };
        xhr.open('POST', '/admin/media/upload');
        xhr.send(fd);
      }

      function onUploadComplete() {
        uploadDone++;
        if (uploadDone === uploadTotal) setTimeout(() => location.reload(), 700);
      }

      function _fmt(b) {
        if (b < 1024) return b + ' B';
        if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
        return (b / 1048576).toFixed(1) + ' MB';
      }

      function _esc(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      }

      function copyUrl(url) {
        navigator.clipboard.writeText(url).then(() => {
          const btn = event.target;
          btn.textContent = 'Copied!';
          setTimeout(() => btn.textContent = 'Copy URL', 1500);
        });
      }
    </script>
  `;

  return new Response(adminHTML("Media", body, session), { headers: { "Content-Type": "text/html" } });
});

// ─── Upload handler ───────────────────────────────────────────────────────────

export const handleUpload = requireAuth(async (req, params, session) => {
  const form = req._form;
  if (!form) return new Response("No form data", { status: 400 });

  const { verifyCsrfToken } = await import("../core/csrf.js");
  const token = form.get("_csrf");
  if (!verifyCsrfToken(token, session.id)) {
    return new Response("Invalid request (CSRF)", { status: 403 });
  }

  const db = getDB();
  const uploadDir = join(process.cwd(), config.uploads?.path || "data/uploads");
  mkdirSync(uploadDir, { recursive: true });

  const files = form.getAll("file");
  const errors = [];

  for (const file of files) {
    if (!file || !file.name) continue;
    try {
      const { safeName, buffer, mimeType, originalName, size } = await validateUpload(file);
      const filePath = join(uploadDir, safeName);
      if (typeof Bun !== "undefined") {
        await Bun.write(filePath, buffer);
      } else {
        const { writeFile } = await import("fs/promises");
        await writeFile(filePath, Buffer.from(buffer));
      }

      await db.run(`
        INSERT INTO media (filename, original_name, path, url, mime_type, size, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [safeName, originalName, `uploads/${safeName}`, `/uploads/${safeName}`, mimeType, size, session.userId]);

    } catch (err) {
      console.error("Upload error:", err.message);
      errors.push(`${file.name}: ${err.message}`);
    }
  }

  if (errors.length) {
    return new Response(
      adminHTML("Upload Error", `<div class="card"><h2>Upload errors</h2><ul>${errors.map(e => `<li>${esc(e)}</li>`).join("")}</ul><a href="/admin/media" class="btn btn-secondary" style="margin-top:15px">Back to Library</a></div>`, session),
      { status: 400, headers: { "Content-Type": "text/html" } }
    );
  }

  return Response.redirect("/admin/media", 302);
});

// ─── Delete handler ───────────────────────────────────────────────────────────

export const handleDeleteMedia = requireAuth(csrfProtect(async (req, params, session) => {
  const db = getDB();
  const item = await db.get("SELECT * FROM media WHERE id = ?", [params.id]);
  if (!item) return new Response("Not found", { status: 404 });

  const filePath = join(process.cwd(), item.path);
  if (existsSync(filePath)) {
    try { unlinkSync(filePath); } catch {}
  }

  await db.run("DELETE FROM media WHERE id = ?", [params.id]);
  return Response.redirect("/admin/media", 302);
}));

function fileIcon(mimeType) {
  if (mimeType === "application/pdf") return "📄";
  if (mimeType.startsWith("image/")) return "🖼️";
  return "📎";
}

function fmtSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function esc(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
