// src/admin/users.js
import { getDB } from "../db.js";
import { adminHTML } from "./base.js";
import { requireAuth } from "../core/auth.js";
import { csrfProtect, generateCsrfToken } from "../core/csrf.js";
import { hashPassword } from "../core/auth.js";

// ─── Users ────────────────────────────────────────────────────────────────────

export const usersList = requireAuth(async (req, params, session) => {
  const db = getDB();
  const users = db.prepare(`
    SELECT u.id, u.username, u.email, u.is_active, u.is_superuser, u.last_login, u.created_at,
           GROUP_CONCAT(g.name, ', ') as groups
    FROM users u
    LEFT JOIN user_groups ug ON ug.user_id = u.id
    LEFT JOIN groups g ON g.id = ug.group_id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `).all();

  const csrfToken = generateCsrfToken(session.id);

  const rows = users.map(u => `
    <tr>
      <td><strong>${escHtml(u.username)}</strong></td>
      <td>${escHtml(u.email || "—")}</td>
      <td>${u.groups ? escHtml(u.groups) : '<span style="color:#94a3b8">No groups</span>'}</td>
      <td>
        ${u.is_superuser ? '<span class="badge badge-success">Superuser</span>' : ''}
        ${u.is_active ? '<span class="badge badge-info">Active</span>' : '<span class="badge" style="background:#fee2e2;color:#991b1b">Inactive</span>'}
      </td>
      <td>${u.last_login ? new Date(u.last_login).toLocaleDateString() : "Never"}</td>
      <td>
        <a href="/admin/users/${u.id}/edit" class="btn btn-secondary" style="padding:6px 14px;font-size:13px">Edit</a>
      </td>
    </tr>
  `).join("");

  const body = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h2>Users</h2>
      <a href="/admin/users/new" class="btn btn-primary">+ New User</a>
    </div>
    <div class="card">
      <table>
        <thead><tr>
          <th>Username</th><th>Email</th><th>Groups</th><th>Status</th><th>Last Login</th><th>Actions</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:#94a3b8">No users yet</td></tr>'}</tbody>
      </table>
    </div>
  `;
  return new Response(adminHTML("Users", body, session), { headers: { "Content-Type": "text/html" } });
});

export const newUserPage = requireAuth(async (req, params, session) => {
  const db = getDB();
  const groups = db.prepare("SELECT id, name FROM groups ORDER BY name").all();
  const csrfToken = generateCsrfToken(session.id);

  const groupCheckboxes = groups.map(g => `
    <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <input type="checkbox" name="groups" value="${g.id}"> ${escHtml(g.name)}
    </label>
  `).join("");

  const body = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h2>New User</h2>
      <a href="/admin/users" class="btn btn-secondary">← Back</a>
    </div>
    <div class="card" style="max-width:600px">
      <form method="POST" action="/admin/users/new">
        <input type="hidden" name="_csrf" value="${csrfToken}">
        <label style="font-weight:600;font-size:13px">Username</label>
        <input type="text" name="username" required>
        <label style="font-weight:600;font-size:13px">Email</label>
        <input type="email" name="email">
        <label style="font-weight:600;font-size:13px">Password</label>
        <input type="password" name="password" required>
        <label style="font-weight:600;font-size:13px;display:block;margin-bottom:10px">Groups</label>
        ${groupCheckboxes || '<p style="color:#94a3b8;margin-bottom:15px">No groups yet — <a href="/admin/groups">create one</a></p>'}
        <div style="display:flex;gap:10px;align-items:center;margin-top:15px">
          <label style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" name="is_superuser" value="1"> Superuser (bypasses all permissions)
          </label>
        </div>
        <button type="submit" class="btn btn-primary" style="margin-top:20px;width:100%">Create User</button>
      </form>
    </div>
  `;
  return new Response(adminHTML("New User", body, session), { headers: { "Content-Type": "text/html" } });
});

export const handleNewUser = requireAuth(csrfProtect(async (req, params, session) => {
  const form = req._form;
  const username = form.get("username")?.trim();
  const email = form.get("email")?.trim() || null;
  const password = form.get("password");
  const isSuperuser = form.get("is_superuser") === "1" ? 1 : 0;
  const groupIds = form.getAll("groups");

  if (!username || !password) {
    return new Response("Username and password required", { status: 400 });
  }

  const db = getDB();
  const hash = await hashPassword(password);

  const result = db.prepare(
    "INSERT INTO users (username, email, password_hash, is_superuser) VALUES (?, ?, ?, ?)"
  ).run(username, email, hash, isSuperuser);

  const userId = result.lastInsertRowid;

  for (const gid of groupIds) {
    db.prepare("INSERT OR IGNORE INTO user_groups (user_id, group_id) VALUES (?, ?)").run(userId, gid);
  }

  return Response.redirect("/admin/users", 302);
}));

export const editUserPage = requireAuth(async (req, params, session) => {
  const db = getDB();
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(params.id);
  if (!user) return new Response("User not found", { status: 404 });

  const allGroups = db.prepare("SELECT id, name FROM groups ORDER BY name").all();
  const userGroupIds = db.prepare("SELECT group_id FROM user_groups WHERE user_id = ?")
    .all(params.id).map(r => r.group_id);

  const csrfToken = generateCsrfToken(session.id);

  const groupCheckboxes = allGroups.map(g => `
    <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <input type="checkbox" name="groups" value="${g.id}" ${userGroupIds.includes(g.id) ? "checked" : ""}> ${escHtml(g.name)}
    </label>
  `).join("");

  const body = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h2>Edit User: ${escHtml(user.username)}</h2>
      <a href="/admin/users" class="btn btn-secondary">← Back</a>
    </div>
    <div class="card" style="max-width:600px">
      <form method="POST" action="/admin/users/${user.id}/edit">
        <input type="hidden" name="_csrf" value="${csrfToken}">
        <label style="font-weight:600;font-size:13px">Username</label>
        <input type="text" name="username" value="${escHtml(user.username)}" required>
        <label style="font-weight:600;font-size:13px">Email</label>
        <input type="email" name="email" value="${escHtml(user.email || "")}">
        <label style="font-weight:600;font-size:13px">New Password <span style="color:#94a3b8;font-weight:400">(leave blank to keep current)</span></label>
        <input type="password" name="password">
        <label style="font-weight:600;font-size:13px;display:block;margin-bottom:10px">Groups</label>
        ${groupCheckboxes || '<p style="color:#94a3b8;margin-bottom:15px">No groups yet</p>'}
        <div style="display:flex;gap:20px;margin-top:15px">
          <label style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" name="is_active" value="1" ${user.is_active ? "checked" : ""}> Active
          </label>
          <label style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" name="is_superuser" value="1" ${user.is_superuser ? "checked" : ""}> Superuser
          </label>
        </div>
        <button type="submit" class="btn btn-primary" style="margin-top:20px;width:100%">Save Changes</button>
      </form>
    </div>
  `;
  return new Response(adminHTML("Edit User", body, session), { headers: { "Content-Type": "text/html" } });
});

export const handleEditUser = requireAuth(csrfProtect(async (req, params, session) => {
  const db = getDB();
  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(params.id);
  if (!user) return new Response("User not found", { status: 404 });

  const form = req._form;
  const username = form.get("username")?.trim();
  const email = form.get("email")?.trim() || null;
  const password = form.get("password");
  const isActive = form.get("is_active") === "1" ? 1 : 0;
  const isSuperuser = form.get("is_superuser") === "1" ? 1 : 0;
  const groupIds = form.getAll("groups");

  if (password) {
    const hash = await hashPassword(password);
    db.prepare("UPDATE users SET username=?, email=?, password_hash=?, is_active=?, is_superuser=? WHERE id=?")
      .run(username, email, hash, isActive, isSuperuser, params.id);
  } else {
    db.prepare("UPDATE users SET username=?, email=?, is_active=?, is_superuser=? WHERE id=?")
      .run(username, email, isActive, isSuperuser, params.id);
  }

  db.prepare("DELETE FROM user_groups WHERE user_id = ?").run(params.id);
  for (const gid of groupIds) {
    db.prepare("INSERT OR IGNORE INTO user_groups (user_id, group_id) VALUES (?, ?)").run(params.id, gid);
  }

  return Response.redirect("/admin/users", 302);
}));

// ─── Groups ───────────────────────────────────────────────────────────────────

export const groupsList = requireAuth(async (req, params, session) => {
  const db = getDB();
  const groups = db.prepare(`
    SELECT g.id, g.name, g.description,
           COUNT(DISTINCT ug.user_id) as user_count,
           COUNT(DISTINCT gp.permission_id) as perm_count
    FROM groups g
    LEFT JOIN user_groups ug ON ug.group_id = g.id
    LEFT JOIN group_permissions gp ON gp.group_id = g.id
    GROUP BY g.id
    ORDER BY g.name
  `).all();

  const csrfToken = generateCsrfToken(session.id);

  const rows = groups.map(g => `
    <tr>
      <td><strong>${escHtml(g.name)}</strong></td>
      <td>${escHtml(g.description || "—")}</td>
      <td>${g.user_count} users</td>
      <td>${g.perm_count} permissions</td>
      <td>
        <a href="/admin/groups/${g.id}/edit" class="btn btn-secondary" style="padding:6px 14px;font-size:13px">Edit</a>
      </td>
    </tr>
  `).join("");

  const body = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h2>Groups</h2>
      <a href="/admin/groups/new" class="btn btn-primary">+ New Group</a>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>Name</th><th>Description</th><th>Members</th><th>Permissions</th><th>Actions</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#94a3b8">No groups yet</td></tr>'}</tbody>
      </table>
    </div>
  `;
  return new Response(adminHTML("Groups", body, session), { headers: { "Content-Type": "text/html" } });
});

export const newGroupPage = requireAuth(async (req, params, session) => {
  const csrfToken = generateCsrfToken(session.id);
  const body = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h2>New Group</h2>
      <a href="/admin/groups" class="btn btn-secondary">← Back</a>
    </div>
    <div class="card" style="max-width:600px">
      <form method="POST" action="/admin/groups/new">
        <input type="hidden" name="_csrf" value="${csrfToken}">
        <label style="font-weight:600;font-size:13px">Group Name</label>
        <input type="text" name="name" required>
        <label style="font-weight:600;font-size:13px">Description</label>
        <input type="text" name="description">
        <button type="submit" class="btn btn-primary" style="width:100%">Create Group</button>
      </form>
    </div>
  `;
  return new Response(adminHTML("New Group", body, session), { headers: { "Content-Type": "text/html" } });
});

export const handleNewGroup = requireAuth(csrfProtect(async (req, params, session) => {
  const form = req._form;
  const name = form.get("name")?.trim();
  const description = form.get("description")?.trim() || null;
  if (!name) return new Response("Group name required", { status: 400 });

  getDB().prepare("INSERT INTO groups (name, description) VALUES (?, ?)").run(name, description);
  return Response.redirect("/admin/groups", 302);
}));

export const editGroupPage = requireAuth(async (req, params, session) => {
  const db = getDB();
  const group = db.prepare("SELECT * FROM groups WHERE id = ?").get(params.id);
  if (!group) return new Response("Group not found", { status: 404 });

  const allPerms = db.prepare(
    "SELECT * FROM permissions WHERE object_id IS NULL ORDER BY object_type, codename"
  ).all();
  const groupPermIds = db.prepare("SELECT permission_id FROM group_permissions WHERE group_id = ?")
    .all(params.id).map(r => r.permission_id);

  const csrfToken = generateCsrfToken(session.id);

  // Group permissions by object_type
  const byType = {};
  for (const p of allPerms) {
    if (!byType[p.object_type]) byType[p.object_type] = [];
    byType[p.object_type].push(p);
  }

  const permSections = Object.entries(byType).map(([type, perms]) => `
    <div style="margin-bottom:20px">
      <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">${type}</div>
      ${perms.map(p => `
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:14px">
          <input type="checkbox" name="permissions" value="${p.id}" ${groupPermIds.includes(p.id) ? "checked" : ""}> ${escHtml(p.name)}
        </label>
      `).join("")}
    </div>
  `).join("");

  const body = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h2>Edit Group: ${escHtml(group.name)}</h2>
      <a href="/admin/groups" class="btn btn-secondary">← Back</a>
    </div>
    <div class="card" style="max-width:600px">
      <form method="POST" action="/admin/groups/${group.id}/edit">
        <input type="hidden" name="_csrf" value="${csrfToken}">
        <label style="font-weight:600;font-size:13px">Group Name</label>
        <input type="text" name="name" value="${escHtml(group.name)}" required>
        <label style="font-weight:600;font-size:13px">Description</label>
        <input type="text" name="description" value="${escHtml(group.description || "")}">
        <div style="border-top:1px solid #f1f5f9;margin:20px 0;padding-top:20px">
          <div style="font-weight:600;font-size:14px;margin-bottom:15px">Permissions</div>
          ${permSections}
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%">Save Group</button>
      </form>
    </div>
  `;
  return new Response(adminHTML("Edit Group", body, session), { headers: { "Content-Type": "text/html" } });
});

export const handleEditGroup = requireAuth(csrfProtect(async (req, params, session) => {
  const db = getDB();
  const group = db.prepare("SELECT id FROM groups WHERE id = ?").get(params.id);
  if (!group) return new Response("Group not found", { status: 404 });

  const form = req._form;
  const name = form.get("name")?.trim();
  const description = form.get("description")?.trim() || null;
  const permIds = form.getAll("permissions");

  db.prepare("UPDATE groups SET name=?, description=? WHERE id=?").run(name, description, params.id);
  db.prepare("DELETE FROM group_permissions WHERE group_id=?").run(params.id);
  for (const pid of permIds) {
    db.prepare("INSERT OR IGNORE INTO group_permissions (group_id, permission_id) VALUES (?, ?)").run(params.id, pid);
  }

  return Response.redirect("/admin/groups", 302);
}));

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
