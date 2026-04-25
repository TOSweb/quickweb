// src/core/permissions.js
import { getDB } from "../db.js";

const ACTIONS_BY_TYPE = {
  page:      ["view", "edit", "publish", "delete"],
  component: ["edit_content", "edit_structure"],
  blogpost:  ["view", "edit", "publish", "delete"],
  media:     ["view", "upload", "delete"],
  user:      ["view", "edit", "delete"],
  settings:  ["view", "edit"],
};

export function createObjectPermissions(objectType, objectId) {
  const db = getDB();
  const actions = ACTIONS_BY_TYPE[objectType] || ["view", "edit", "delete"];
  const insert = db.prepare(
    `INSERT OR IGNORE INTO permissions (codename, name, object_type, object_id)
     VALUES (?, ?, ?, ?)`
  );
  for (const action of actions) {
    insert.run(
      `${action}_${objectType}`,
      `Can ${action} ${objectType} #${objectId}`,
      objectType,
      objectId
    );
  }
}

export function deleteObjectPermissions(objectType, objectId) {
  getDB().prepare(
    "DELETE FROM permissions WHERE object_type = ? AND object_id = ?"
  ).run(objectType, objectId);
}

export function hasPermission(userId, codename, objectType, objectId = null) {
  const db = getDB();

  const user = db.prepare("SELECT is_superuser FROM users WHERE id = ?").get(userId);
  if (user?.is_superuser) return true;

  const directCheck = db.prepare(`
    SELECT 1 FROM user_permissions up
    JOIN permissions p ON p.id = up.permission_id
    WHERE up.user_id = ?
      AND p.codename = ?
      AND p.object_type = ?
      AND (p.object_id = ? OR p.object_id IS NULL)
    LIMIT 1
  `).get(userId, codename, objectType, objectId);
  if (directCheck) return true;

  const groupCheck = db.prepare(`
    SELECT 1 FROM user_groups ug
    JOIN group_permissions gp ON gp.group_id = ug.group_id
    JOIN permissions p ON p.id = gp.permission_id
    WHERE ug.user_id = ?
      AND p.codename = ?
      AND p.object_type = ?
      AND (p.object_id = ? OR p.object_id IS NULL)
    LIMIT 1
  `).get(userId, codename, objectType, objectId);

  return !!groupCheck;
}

// Middleware factory — wraps a handler, rejects if permission missing.
// getObjectId: optional fn(params) -> id for object-level checks.
export function requirePermission(codename, objectType, getObjectId = null) {
  return (handler) => async (req, params, session) => {
    const objectId = getObjectId ? getObjectId(params) : null;
    if (!hasPermission(session.userId, codename, objectType, objectId)) {
      return new Response("Permission denied", { status: 403 });
    }
    return handler(req, params, session);
  };
}
