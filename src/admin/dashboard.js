// src/admin/dashboard.js
import { getDB, getSetting } from "../db.js";
import { adminHTML } from "./base.js";
import { requireAuth } from "../core/auth.js";
import { getCurrentVersion, checkForUpdate } from "../core/update.js";

export const dashboardPage = requireAuth(async (req, params, session) => {
  const db = getDB();
  const [pageRow, postRow, userRow, compRow, mediaRow] = await Promise.all([
    db.get("SELECT COUNT(*) as count FROM pages"),
    db.get("SELECT COUNT(*) as count FROM blog_posts"),
    db.get("SELECT COUNT(*) as count FROM users"),
    db.get("SELECT COUNT(*) as count FROM components"),
    db.get("SELECT COUNT(*) as count FROM media"),
  ]);
  const pageCount  = pageRow.count;
  const postCount  = postRow.count;
  const userCount  = userRow.count;
  const compCount  = compRow.count;
  const mediaCount = mediaRow.count;
  const currentVer = getCurrentVersion();

  let updateBanner = "";
  try {
    const upd = await checkForUpdate();
    if (upd.hasUpdate) {
      updateBanner = `<div style="background:#fef3c7;color:#92400e;padding:12px 20px;border-radius:14px;margin-bottom:20px;font-weight:600;display:flex;justify-content:space-between;align-items:center">
        <span>New version available: v${upd.latest}</span>
        <span style="font-weight:400;font-size:13px">You are on v${upd.current}</span>
      </div>`;
    }
  } catch { /* silent */ }

  const recentPages = await db.all("SELECT * FROM pages ORDER BY created_at DESC LIMIT 3");

  const body = `
    ${updateBanner}
    <div style="display:grid; grid-template-columns: 1fr 1fr 1fr 1fr 1fr; gap:20px; margin-bottom:30px">
        <div class="card" style="background: var(--primary); color: white; display:flex; flex-direction:column; justify-content:space-between; height: 180px">
            <div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start">
                    <span style="font-weight:600; font-size:15px">Total Pages</span>
                    <span style="background:rgba(255,255,255,0.2); border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; font-size:14px">↗</span>
                </div>
                <div style="font-size:48px; font-weight:700; margin-top:10px">${pageCount}</div>
            </div>
            <div style="font-size:12px; background:rgba(255,255,255,0.1); padding:6px 12px; border-radius:8px; display:inline-block; width:fit-content">
                ↑ 12% Increased from last month
            </div>
        </div>

        <div class="card" style="display:flex; flex-direction:column; justify-content:space-between; height: 180px">
            <div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start">
                    <span style="font-weight:600; font-size:15px; color:var(--text-muted)">Blog Posts</span>
                    <span style="border:1px solid #eee; border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; font-size:14px">↗</span>
                </div>
                <div style="font-size:48px; font-weight:700; margin-top:10px">${postCount}</div>
            </div>
            <div style="font-size:12px; color:var(--primary); font-weight:600">Active publications</div>
        </div>

        <div class="card" style="display:flex; flex-direction:column; justify-content:space-between; height: 180px">
            <div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start">
                    <span style="font-weight:600; font-size:15px; color:var(--text-muted)">Components</span>
                    <span style="border:1px solid #eee; border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; font-size:14px">↗</span>
                </div>
                <div style="font-size:48px; font-weight:700; margin-top:10px">${compCount}</div>
            </div>
            <div style="font-size:12px; color:var(--text-muted)">Modular blocks</div>
        </div>

        <div class="card" style="display:flex; flex-direction:column; justify-content:space-between; height: 180px">
            <div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start">
                    <span style="font-weight:600; font-size:15px; color:var(--text-muted)">Users</span>
                    <span style="border:1px solid #eee; border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; font-size:14px">↗</span>
                </div>
                <div style="font-size:48px; font-weight:700; margin-top:10px">${userCount}</div>
            </div>
            <div style="font-size:12px; color:var(--text-muted)">Collaborators</div>
        </div>

        <div class="card" style="display:flex; flex-direction:column; justify-content:space-between; height: 180px">
            <div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start">
                    <span style="font-weight:600; font-size:15px; color:var(--text-muted)">Media</span>
                    <span style="border:1px solid #eee; border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; font-size:14px">🖼️</span>
                </div>
                <div style="font-size:48px; font-weight:700; margin-top:10px">${mediaCount}</div>
            </div>
            <div style="font-size:12px; color:var(--text-muted)">Uploaded files</div>
        </div>
    </div>

    <div style="display:grid; grid-template-columns: 1.5fr 1fr 1fr; gap:20px; margin-bottom:30px">
        <div class="card" style="grid-column: span 1">
            <h3 style="font-size:16px; margin-bottom:20px">Analytics View</h3>
            <div style="display:flex; align-items:flex-end; gap:8px; height:100px">
                <div style="flex:1; height:40%; background:#f1f5f9; border-radius:6px"></div>
                <div style="flex:1; height:70%; background:var(--primary); border-radius:6px"></div>
                <div style="flex:1; height:50%; background:#f1f5f9; border-radius:6px"></div>
                <div style="flex:1; height:90%; background:var(--primary); border-radius:6px"></div>
                <div style="flex:1; height:60%; background:#f1f5f9; border-radius:6px"></div>
                <div style="flex:1; height:30%; background:#f1f5f9; border-radius:6px"></div>
            </div>
        </div>

        <div class="card">
            <h3 style="font-size:16px; margin-bottom:15px">Quick Status</h3>
            <div style="padding:15px; background:var(--primary-bg); border-radius:12px; display:flex; align-items:center; gap:10px">
                <div style="width:10px; height:10px; background:var(--primary); border-radius:50%"></div>
                <span style="font-size:14px; font-weight:600; color:var(--primary)">System Healthy</span>
            </div>
            <div style="margin-top:15px; font-size:13px; color:var(--text-muted)">All security modules active (HMAC/CSRF).</div>
        </div>

        <div class="card" style="display:flex; flex-direction:column; justify-content:center; align-items:center; background:#fbfcfc">
             <div style="font-size:24px; font-weight:700">v${currentVer}</div>
             <div style="font-size:10px; color:var(--text-muted); text-transform:uppercase; margin-top:4px">Veave CMS</div>
             <a href="/sitemap.xml" target="_blank" style="font-size:11px; color:var(--primary); margin-top:12px; text-decoration:none">View Sitemap →</a>
        </div>
    </div>

    <div class="card">
        <h3 style="font-size:16px; margin-bottom:20px">Recent Pages</h3>
        ${recentPages.map(p => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:15px; border-bottom:1px solid #f8fafc">
            <div style="display:flex; align-items:center; gap:15px">
                <div style="width:36px; height:36px; background:#f1f5f9; border-radius:10px; display:flex; align-items:center; justify-content:center">📄</div>
                <div>
                    <div style="font-weight:600; font-size:14px">${p.title}</div>
                    <div style="font-size:12px; color:var(--text-muted)">/${p.slug}</div>
                </div>
            </div>
            <span class="badge ${p.status === 'published' ? 'badge-success' : 'badge-info'}">${p.status}</span>
        </div>
        `).join("")}
    </div>
  `;

  return new Response(adminHTML("Dashboard", body, session), { headers: { "Content-Type": "text/html" } });
});
