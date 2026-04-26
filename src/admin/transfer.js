// src/admin/transfer.js — export (zip download) + import (pending-boot swap)
import { adminHTML } from "./base.js";
import { requireAuth } from "../core/auth.js";
import { csrfProtect, generateCsrfToken } from "../core/csrf.js";
import { getDB } from "../db.js";
import config from "../config.js";
import AdmZip from "adm-zip";
import { join, resolve, relative } from "path";
import {
  existsSync, mkdirSync, writeFileSync, readFileSync,
  readdirSync, statSync, rmSync, copyFileSync,
} from "fs";

// ─── Pending-import staging paths ────────────────────────────────────────────
const DATA_DIR    = join(process.cwd(), "data");
const PENDING_FLAG    = join(DATA_DIR, ".pending-import.flag");
const PENDING_DB      = join(DATA_DIR, ".pending-import.db");
const PENDING_UPLOADS = join(DATA_DIR, ".pending-import-uploads");

// ─── Boot hook — call before initDB() in index.js ────────────────────────────
export function applyPendingImport() {
  if (!existsSync(PENDING_FLAG)) return;
  console.log("⬡  Applying pending content transfer...");

  try {
    if (existsSync(PENDING_DB)) {
      const dbDest = resolve(config.db.path);
      mkdirSync(join(dbDest, ".."), { recursive: true });
      copyFileSync(PENDING_DB, dbDest);
      rmSync(PENDING_DB);
      console.log(`  ✓ Database replaced → ${config.db.path}`);
    }

    if (existsSync(PENDING_UPLOADS)) {
      const uploadsDest = resolve(config.uploads.path);
      mkdirSync(uploadsDest, { recursive: true });
      for (const { full, rel } of walkDir(PENDING_UPLOADS)) {
        const dest = join(uploadsDest, rel);
        mkdirSync(join(dest, ".."), { recursive: true });
        copyFileSync(full, dest);
      }
      rmSync(PENDING_UPLOADS, { recursive: true });
      console.log(`  ✓ Uploads merged → ${config.uploads.path}`);
    }

    rmSync(PENDING_FLAG);
    console.log("✓ Content transfer applied");
  } catch (err) {
    console.error("[TRANSFER BOOT ERROR]:", err);
    // Non-fatal — continue with whatever DB is already there
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isMysql = config.db?.driver === "mysql";

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function walkDir(dir, base = dir) {
  if (!existsSync(dir)) return [];
  const results = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      results.push(...walkDir(full, base));
    } else {
      results.push({ full, rel: relative(base, full) });
    }
  }
  return results;
}

// ─── Export ───────────────────────────────────────────────────────────────────
export const handleExport = requireAuth(csrfProtect(async (req, _params, _session) => {
  if (isMysql) {
    return new Response("Export is not supported for MySQL. Use mysqldump instead.", { status: 400 });
  }

  const dbPath = resolve(config.db.path);
  if (!existsSync(dbPath)) {
    return new Response("Database file not found.", { status: 500 });
  }

  // Flush WAL into the main .db file so the export is self-contained
  try { await getDB().run("PRAGMA wal_checkpoint(TRUNCATE)", []); } catch { /* non-fatal */ }

  const zip = new AdmZip();
  zip.addFile("cms.db", readFileSync(dbPath));

  const uploadsPath = resolve(config.uploads.path);
  for (const { full, rel } of walkDir(uploadsPath)) {
    zip.addFile(`uploads/${rel}`, readFileSync(full));
  }

  const date = new Date().toISOString().slice(0, 10);
  const buf  = zip.toBuffer();

  return new Response(buf, {
    headers: {
      "Content-Type":        "application/octet-stream",
      "Content-Disposition": `attachment; filename="veave-transfer-${date}.veavetransfer"`,
      "Content-Length":      String(buf.length),
    },
  });
}));

// ─── Import ───────────────────────────────────────────────────────────────────
export const handleImport = requireAuth(csrfProtect(async (req, _params, _session) => {
  if (isMysql) {
    return new Response("Import is not supported for MySQL.", { status: 400 });
  }

  const form = req._form;
  const file = form.get("zipfile");

  if (!file || (!file.name.endsWith(".veavetransfer") && !file.name.endsWith(".zip"))) {
    return Response.redirect("/admin/transfer?error=" + encodeURIComponent("Please upload a .veavetransfer file exported from Veave CMS."), 303);
  }

  try {
    const zip = new AdmZip(Buffer.from(await file.arrayBuffer()));

    const dbEntry = zip.getEntry("cms.db");
    if (!dbEntry) {
      return Response.redirect(
        "/admin/transfer?error=" + encodeURIComponent("Invalid package — cms.db not found in the ZIP."), 303
      );
    }

    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(PENDING_DB, dbEntry.getData());

    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      if (!entry.entryName.startsWith("uploads/")) continue;
      const rel = entry.entryName.slice("uploads/".length);
      if (!rel) continue;
      const dest = join(PENDING_UPLOADS, rel);
      // Path-traversal guard
      if (!dest.startsWith(PENDING_UPLOADS + "/")) continue;
      mkdirSync(join(dest, ".."), { recursive: true });
      writeFileSync(dest, entry.getData());
    }

    // Write flag last — boot hook only fires when this exists
    writeFileSync(PENDING_FLAG, new Date().toISOString());

    return Response.redirect("/admin/transfer?imported=1", 303);
  } catch (err) {
    console.error("[TRANSFER IMPORT ERROR]:", err);
    return Response.redirect(
      "/admin/transfer?error=" + encodeURIComponent("Failed to process ZIP: " + err.message), 303
    );
  }
}));

// ─── Cancel pending import ────────────────────────────────────────────────────
export const handleCancelImport = requireAuth(csrfProtect(async (_req, _params, _session) => {
  if (existsSync(PENDING_FLAG))    rmSync(PENDING_FLAG);
  if (existsSync(PENDING_DB))      rmSync(PENDING_DB);
  if (existsSync(PENDING_UPLOADS)) rmSync(PENDING_UPLOADS, { recursive: true });
  return Response.redirect("/admin/transfer?cancelled=1", 303);
}));

// ─── Page ─────────────────────────────────────────────────────────────────────
export const transferPage = requireAuth(async (req, _params, session) => {
  const url       = new URL(req.url);
  const imported  = url.searchParams.get("imported");
  const cancelled = url.searchParams.get("cancelled");
  const error     = url.searchParams.get("error");
  const csrf      = generateCsrfToken(session.id);
  const hasPending = existsSync(PENDING_FLAG);

  const mysqlNote = `<div style="background:#fef9c3;border-radius:10px;padding:12px 16px;font-size:13px;color:#92400e">
    Only supported for SQLite. For MySQL use <code>mysqldump</code> / <code>mysql</code> CLI tools.
  </div>`;

  const body = `
    <div style="margin-bottom:24px">
      <h2 style="margin-bottom:4px">Content Transfer</h2>
      <p style="color:#64748b;font-size:14px">Move your database and uploads between local and production.</p>
    </div>

    ${hasPending ? `
    <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:14px;padding:16px 20px;margin-bottom:20px;display:flex;align-items:center;gap:12px">
      <span style="font-size:20px">⏳</span>
      <div style="flex:1">
        <strong>Import pending — restart the server to apply it.</strong>
        <div style="font-size:13px;color:#92400e;margin-top:2px">Your site stays live. The import is applied on the next server boot.</div>
      </div>
      <form method="POST" action="/admin/transfer/cancel" style="margin:0">
        <input type="hidden" name="_csrf" value="${csrf}">
        <button class="btn btn-secondary" style="font-size:13px;padding:7px 14px">Cancel</button>
      </form>
    </div>` : ""}

    ${imported  ? `<div style="background:#d1fae5;color:#065f46;padding:12px 18px;border-radius:12px;margin-bottom:20px;font-size:14px;font-weight:500">✅ Import staged — restart the server to apply it.</div>` : ""}
    ${cancelled ? `<div style="background:#f1f5f9;color:#334155;padding:12px 18px;border-radius:12px;margin-bottom:20px;font-size:14px">Pending import cancelled.</div>` : ""}
    ${error     ? `<div style="background:#fef2f2;color:#991b1b;padding:12px 18px;border-radius:12px;margin-bottom:20px;font-size:14px">${esc(decodeURIComponent(error))}</div>` : ""}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start">

      <!-- Export -->
      <div class="card">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
          <span style="font-size:22px">📦</span>
          <h3 style="margin:0">Export Content Package</h3>
        </div>
        <p style="color:#64748b;font-size:14px;margin-bottom:20px">
          Downloads a <code>.veavetransfer</code> file containing your database and all uploaded media.
          Run this on your <strong>local / source</strong> instance.
        </p>
        ${isMysql ? mysqlNote : `
        <form method="POST" action="/admin/transfer/export">
          <input type="hidden" name="_csrf" value="${csrf}">
          <button class="btn btn-primary" style="width:100%;padding:14px;font-size:15px">⬇ Download Transfer ZIP</button>
        </form>
        <p style="font-size:12px;color:#94a3b8;margin-top:10px">Saves as <code>.veavetransfer</code> — bypasses antivirus false positives on .zip files. Includes database + all uploads.</p>`}
      </div>

      <!-- Import -->
      <div class="card">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
          <span style="font-size:22px">⬆</span>
          <h3 style="margin:0">Import Content Package</h3>
        </div>
        <p style="color:#64748b;font-size:14px;margin-bottom:16px">
          Upload a ZIP from your source instance.
          Run this on your <strong>production / destination</strong> server.
        </p>
        ${isMysql ? mysqlNote : `
        <div style="background:#fef2f2;border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:13px;color:#991b1b">
          ⚠ <strong>This replaces your database.</strong> Back up first if production has live content you want to keep.
        </div>
        <form method="POST" action="/admin/transfer/import" enctype="multipart/form-data">
          <input type="hidden" name="_csrf" value="${csrf}">
          <div style="background:#f8fafb;border:2px dashed #e2e8f0;padding:28px;border-radius:12px;text-align:center;margin-bottom:16px">
            <input type="file" name="zipfile" accept=".veavetransfer,.zip" required style="margin:0;background:transparent;border:none;padding:0;width:auto">
          </div>
          <button class="btn btn-primary" style="width:100%;padding:14px;font-size:15px">⬆ Upload &amp; Stage Import</button>
        </form>
        <p style="font-size:12px;color:#94a3b8;margin-top:10px">Applied on the <strong>next server restart</strong>. Your site stays live until then.</p>`}
      </div>

    </div>

    <!-- How it works -->
    <div class="card" style="margin-top:8px">
      <h3 style="margin-bottom:16px;font-size:15px">How it works</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px">
        <div style="display:flex;gap:10px;align-items:flex-start">
          <span style="font-size:20px;flex-shrink:0">1️⃣</span>
          <div>
            <div style="font-weight:600;font-size:14px;margin-bottom:3px">Export locally</div>
            <div style="font-size:13px;color:#64748b">On your local Veave admin, click "Download Transfer ZIP".</div>
          </div>
        </div>
        <div style="display:flex;gap:10px;align-items:flex-start">
          <span style="font-size:20px;flex-shrink:0">2️⃣</span>
          <div>
            <div style="font-weight:600;font-size:14px;margin-bottom:3px">Import on production</div>
            <div style="font-size:13px;color:#64748b">On your live server's <code>/admin/transfer</code>, upload the ZIP.</div>
          </div>
        </div>
        <div style="display:flex;gap:10px;align-items:flex-start">
          <span style="font-size:20px;flex-shrink:0">3️⃣</span>
          <div>
            <div style="font-weight:600;font-size:14px;margin-bottom:3px">Restart the server</div>
            <div style="font-size:13px;color:#64748b">The import is applied safely at startup — no downtime.</div>
          </div>
        </div>
      </div>
    </div>
  `;

  return new Response(adminHTML("Transfer", body, session), { headers: { "Content-Type": "text/html" } });
});
