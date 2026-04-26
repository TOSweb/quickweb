// src/admin/base.js
import { generateCsrfToken } from "../core/csrf.js";
import { getContentTypes } from "../core/plugins.js";
import { getSetting } from "../db.js";
import config from "../config.js";

export function adminHTML(title, content, session, { debugData = null } = {}) {
  const csrfToken = generateCsrfToken(session.id);
  const isDev = config.env !== "production";
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} — Veave CMS Admin</title>
    ${getSetting('favicon') ? `<link rel="icon" href="${getSetting('favicon')}">` : ''}
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    
    <style>
        :root {
            --primary: #154d37;
            --primary-soft: #2d6a4f;
            --primary-bg: #e9f5ef;
            --bg-main: #f4f7f6;
            --sidebar-bg: #ffffff;
            --text-main: #1a1c1e;
            --text-muted: #64748b;
            --white: #ffffff;
            --border: #e2e8f0;
            
            --radius-xl: 32px;
            --radius-lg: 24px;
            --radius-md: 16px;
            --shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
            font-family: 'Outfit', sans-serif; 
            background: var(--bg-main);
            color: var(--text-main);
            display: flex;
            height: 100vh;
            overflow: hidden;
            padding: 15px; /* Slightly less padding to feel less cramped */
        }

        /* Sidebar */
        .sidebar { 
            width: 280px; 
            background: var(--sidebar-bg); 
            border-radius: var(--radius-lg);
            display: flex; 
            flex-direction: column; 
            padding: 30px 20px;
            margin-right: 15px;
            box-shadow: var(--shadow);
            flex-shrink: 0;
        }
        .sidebar-brand { 
            font-size: 24px; 
            font-weight: 700; 
            margin-bottom: 40px;
            display: flex;
            align-items: center;
            gap: 12px;
            padding-left: 10px;
        }
        .sidebar-brand-icon {
            width: 32px; height: 32px;
            background: var(--primary);
            border-radius: 10px;
            display: flex; align-items: center; justify-content: center;
            color: white; font-size: 16px;
        }
        .sidebar-brand img {
            max-width: 100%;
            height: 36px;
            object-fit: contain;
        }
        
        .nav-label { 
            font-size: 11px; font-weight: 700; color: #94a3b8; 
            text-transform: uppercase; letter-spacing: 1px;
            margin: 25px 0 10px 10px;
        }
        .nav { 
            flex: 1; 
            list-style: none; 
            padding: 10px 0; 
            overflow-y: auto;
            scrollbar-width: thin;
        }
        .nav::-webkit-scrollbar { width: 4px; }
        .nav::-webkit-scrollbar-thumb { background: #f1f5f9; border-radius: 10px; }
        .nav a { 
            display: flex; align-items: center; padding: 12px 15px; 
            color: var(--text-muted); text-decoration: none; 
            transition: 0.2s; border-radius: 16px;
            font-weight: 500; font-size: 15px; margin-bottom: 2px;
            gap: 12px;
        }
        .nav a:hover { background: #f8fafc; color: var(--primary); }
        .nav a.active { background: var(--primary-bg); color: var(--primary); font-weight: 600; }

        /* Main Content area stays clean */
        .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
        
        .topbar { 
            display: flex; justify-content: space-between; align-items: center;
            height: 64px; padding: 0 10px; margin-bottom: 5px;
        }
        .search-inner {
            background: white; border-radius: 16px; display: flex; align-items: center;
            padding: 8px 16px; width: 350px; box-shadow: var(--shadow);
        }
        .search-inner input { 
            border: none; outline: none; flex: 1; font-family: inherit; font-size: 14px; 
            background: transparent;
        }
        .pill { background: #f1f5f9; color: #64748b; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 700; }

        .profile-pill {
            display: flex; align-items: center; gap: 10px;
            background: white; padding: 4px 4px 4px 15px; border-radius: 30px;
            box-shadow: var(--shadow);
        }
        .profile-pill .name { font-weight: 600; font-size: 13px; }
        .avatar { 
            width: 32px; height: 32px; background: var(--primary-bg); border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            font-weight: 700; color: var(--primary); font-size: 13px;
        }

        /* Scroll Area */
        .scroll { 
            flex: 1; overflow-y: auto; padding: 10px 10px 30px 10px;
            scroll-behavior: smooth;
        }
        .scroll::-webkit-scrollbar { width: 5px; }
        .scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 5px; }

        .card { 
            background: white; padding: 24px; border-radius: var(--radius-lg); 
            box-shadow: var(--shadow); margin-bottom: 20px; border: none;
        }
        
        .btn { 
            padding: 10px 20px; border-radius: 12px; border: none; cursor: pointer; 
            font-weight: 600; text-decoration: none; display: inline-flex; 
            align-items: center; justify-content: center; transition: 0.2s;
            font-size: 14px; font-family: inherit; gap: 8px;
        }
        .btn-primary { background: var(--primary); color: white; }
        .btn-secondary { background: white; color: var(--text-main); border: 1px solid var(--border); }
        
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; padding: 12px; color: #94a3b8; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid #f1f5f9; }
        td { padding: 15px 12px; border-bottom: 1px solid #fcfcfc; font-size: 14px; }

        .badge { padding: 4px 12px; border-radius: 8px; font-size: 11px; font-weight: 600; }
        .badge-success { background: #dcfce7; color: #166534; }
        .badge-info { background: #e0f2fe; color: #0369a1; }

        input[type="text"], input[type="password"], select, textarea {
            background: #f8fafb; border: 1px solid #f1f5f9; padding: 12px 16px;
            border-radius: 12px; width: 100%; margin-bottom: 15px; font-family: inherit;
        }
        input:focus { border-color: var(--primary); background: white; outline: none; box-shadow: 0 0 0 3px var(--primary-bg); }
    </style>
</head>
<body>
    <div class="sidebar">
        <div class="sidebar-brand">
            ${getSetting('site_logo') 
                ? `<img src="${getSetting('site_logo')}" alt="Veave CMS">`
                : `<div class="sidebar-brand-icon">V</div> Veave CMS`
            }
        </div>
        <div class="nav">
            ${(() => {
              const icon = (path) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">${path}</svg>`;
              return `
            <a href="/admin" class="${title === 'Dashboard' ? 'active' : ''}">${icon('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>')} Dashboard</a>
            <a href="/admin/pages" class="${title.includes('Page') ? 'active' : ''}">${icon('<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>')} Pages</a>
            <a href="/admin/components" class="${title === 'Components' || title === 'New Component' ? 'active' : ''}">${icon('<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>')} Components</a>
            <a href="/admin/blog" class="${['Blog','New Post','Edit Post','Categories','New Category','Edit Category'].includes(title) ? 'active' : ''}">${icon('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>')} Blog</a>

            ${(() => {
              const types = getContentTypes();
              const ctMgmtActive = title === "Content Types" || title === "New Content Type" || title.startsWith("Edit:");
              const ctItemActive = (t) => title === t.label || title === `New ${t.singular || t.label.replace(/s$/, "")}` || title === `Edit ${t.singular || t.label.replace(/s$/, "")}`;
              return `<div class="nav-label">Content</div>
                <a href="/admin/content-types" class="${ctMgmtActive ? 'active' : ''}">${icon('<path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2z"/><path d="M7 7h.01"/>')} Content Types</a>
                ${types.map(t => `<a href="/admin/${t.slug}" class="${ctItemActive(t) ? 'active' : ''}">${icon(t.navIcon || '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>')} ${t.label}</a>`).join("")}`;
            })()}

            <div class="nav-label">System</div>
            <a href="/admin/media" class="${title === 'Media' ? 'active' : ''}">${icon('<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>')} Media</a>
            <a href="/admin/redirects" class="${title === 'Redirects' ? 'active' : ''}">${icon('<path d="M20 8h-9a4 4 0 0 0-4 4v8"/><polyline points="16 4 20 8 16 12"/>')} Redirects</a>
            <a href="/admin/users" class="${['Users','New User','Edit User'].includes(title) ? 'active' : ''}">${icon('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>')} Users</a>
            <a href="/admin/groups" class="${['Groups','New Group','Edit Group'].includes(title) ? 'active' : ''}">${icon('<path d="M17 21v-2a4 4 0 0 0-3-3.87"/><path d="M9 21v-2a4 4 0 0 1 3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>')} Groups</a>
            <a href="/admin/settings" class="${title === 'Settings' ? 'active' : ''}">${icon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>')} Settings</a>
            ${session.isSuperuser ? `<a href="/admin/settings/env" class="${title === 'Environment & Secrets' ? 'active' : ''}" style="padding-left:32px;font-size:13px">${icon('<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>')} Env &amp; Secrets</a>` : ""}
            <a href="/admin/hosting" class="${title === 'Deploy Your Site' ? 'active' : ''}">${icon('<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>')} Hosting &amp; Deploy</a>
            <a href="/admin/transfer" class="${title === 'Transfer' ? 'active' : ''}">${icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>')} Transfer</a>
            <a href="/admin/plugins" class="${title === 'Plugins' ? 'active' : ''}">${icon('<path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" y1="8" x2="2" y2="22"/><line x1="17.5" y1="15" x2="9" y2="15"/>')} Plugins</a>
            <a href="/admin/developer/components" class="${title === 'Component Developer' ? 'active' : ''}">${icon('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>')} Developer</a>
            <a href="/admin/logout" style="color:#ef4444; margin-top:20px">${icon('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>')} Logout</a>
            `;})()}
        </div>
    </div>

    <div class="main">
        ${isDev ? `<div style="background:#fef3c7;color:#92400e;text-align:center;padding:6px 12px;font-size:12px;font-weight:600;border-radius:10px;margin-bottom:8px">
          ⚠ DEVELOPMENT MODE — changes here affect localhost only
        </div>` : ""}
        <div class="topbar">
            <div class="search-inner">
                <input type="text" placeholder="Search...">
                <span class="pill">⌘F</span>
            </div>
            <div style="display:flex;align-items:center;gap:12px">
                ${isDev ? `<span style="background:#fef3c7;color:#92400e;font-size:11px;font-weight:700;padding:4px 10px;border-radius:8px">DEV</span>` : `<span style="background:#dcfce7;color:#166534;font-size:11px;font-weight:700;padding:4px 10px;border-radius:8px">PROD</span>`}
                <div class="profile-pill">
                    <span class="name">${session.username}</span>
                    <div class="avatar">${session.username[0].toUpperCase()}</div>
                </div>
            </div>
        </div>
        <div class="scroll">
            ${content}
        </div>
        ${isDev && debugData ? `
        <div style="position:fixed;bottom:0;left:0;right:0;background:#1e293b;color:#94a3b8;font-family:monospace;font-size:11px;padding:6px 16px;display:flex;gap:24px;z-index:9999">
          <span>User: <strong style="color:#f1f5f9">${session.username}</strong>${session.isSuperuser ? ' (superuser)' : ''}</span>
          ${debugData.queryCount != null ? `<span>DB queries: <strong style="color:#f1f5f9">${debugData.queryCount}</strong></span>` : ''}
          ${debugData.renderMs != null ? `<span>Render: <strong style="color:#f1f5f9">${debugData.renderMs}ms</strong></span>` : ''}
          <span>Env: <strong style="color:#fbbf24">development</strong></span>
        </div>` : ''}
    </div>
    <script>window.CSRF_TOKEN = "${csrfToken}";</script>
    <script src="/admin/static/tinymce/tinymce.min.js"></script>
    <script>
      if (typeof tinymce !== 'undefined') {
        tinymce.init({
          selector: 'textarea.richtext',
          plugins: 'preview searchreplace autolink directionality code visualblocks visualchars fullscreen image link media codesample table charmap pagebreak nonbreaking anchor insertdatetime advlist lists wordcount help charmap emoticons',
          menubar: 'file edit view insert format tools table help',
          toolbar: 'undo redo | blocks fontfamily fontsize | bold italic underline strikethrough | alignleft aligncenter alignright alignjustify | outdent indent | numlist bullist | forecolor backcolor removeformat | pagebreak | charmap emoticons | fullscreen preview | image media link anchor codesample',
          toolbar_sticky: true,
          image_advtab: true,
          height: 500,
          skin: 'oxide',
          branding: false,
          promotion: false,
          content_style: 'body { font-family: "Outfit", sans-serif; font-size: 16px; }'
        });
      }
    </script>
</body>
</html>`;
}
