// src/db.js
import { Database } from "bun:sqlite";
import config from "./config.js";
import { join } from "path";
import { mkdirSync } from "fs";

let db;

export async function initDB() {
  const dbDir = join(process.cwd(), "data");
  mkdirSync(dbDir, { recursive: true });

  db = new Database(config.db.path);
  db.run("PRAGMA foreign_keys = ON;");

  // Auth Tables
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    is_superuser INTEGER DEFAULT 0,
    last_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS user_groups (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, group_id)
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codename TEXT NOT NULL,
    name TEXT NOT NULL,
    object_type TEXT NOT NULL,
    object_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(codename, object_type, object_id)
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS group_permissions (
    group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, permission_id)
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS user_permissions (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, permission_id)
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    username TEXT,
    success INTEGER DEFAULT 0,
    attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`);

  // Page & Component Tables
  db.run(`CREATE TABLE IF NOT EXISTS pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    canonical_url TEXT,
    status TEXT DEFAULT 'draft',
    template TEXT DEFAULT 'page',
    publish_at DATETIME,
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS components (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    content TEXT,
    hmac_signature TEXT NOT NULL,
    editable_regions TEXT DEFAULT '[]',
    is_global INTEGER DEFAULT 0,
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS page_components (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id INTEGER REFERENCES pages(id) ON DELETE CASCADE,
    component_id INTEGER REFERENCES components(id) ON DELETE RESTRICT,
    sort_order INTEGER DEFAULT 0,
    UNIQUE(page_id, component_id)
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS redirects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_url TEXT UNIQUE NOT NULL,
    to_url TEXT NOT NULL,
    status_code INTEGER DEFAULT 301,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`);

  // Blog Tables
  db.run(`CREATE TABLE IF NOT EXISTS blog_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    canonical_url TEXT,
    content TEXT,
    excerpt TEXT,
    featured_image TEXT,
    featured_image_alt TEXT,
    seo_title TEXT,
    meta_description TEXT,
    og_title TEXT,
    og_description TEXT,
    og_image TEXT,
    schema_type TEXT DEFAULT 'BlogPosting',
    status TEXT DEFAULT 'draft',
    publish_at DATETIME,
    author_id INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS blog_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    meta_description TEXT
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS blog_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS blog_post_categories (
    post_id INTEGER REFERENCES blog_posts(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES blog_categories(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, category_id)
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS blog_post_tags (
    post_id INTEGER REFERENCES blog_posts(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES blog_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, tag_id)
  );`);

  // Settings & Media
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    original_name TEXT,
    path TEXT NOT NULL,
    url TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER,
    width INTEGER,
    height INTEGER,
    alt_text TEXT,
    uploaded_by INTEGER REFERENCES users(id),
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    data TEXT,
    expires_at DATETIME NOT NULL
  );`);

  // Initial Settings
  const seed = (key, value) => {
    db.run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", [key, value]);
  };
  seed("site_title", "My CMS Site");
  seed("site_tagline", "Built with Bun");
  seed("active_theme", "default");
  seed("posts_per_page", "10");
  seed("cms_version", "1.0.0");
  seed("google_analytics_id", "");
  seed("sitemap_include_pages", "1");
  seed("sitemap_include_posts", "1");

  seedPermissionsAndGroups(db);

  console.log(`✓ Database initialized at ${config.db.path}`);
}

function seedPermissionsAndGroups(db) {
  const TYPE_LEVEL_PERMISSIONS = [
    { codename: "view_page",        name: "Can view all pages",        object_type: "page" },
    { codename: "edit_page",        name: "Can edit all pages",        object_type: "page" },
    { codename: "publish_page",     name: "Can publish all pages",     object_type: "page" },
    { codename: "delete_page",      name: "Can delete all pages",      object_type: "page" },
    { codename: "view_blogpost",    name: "Can view all blog posts",   object_type: "blogpost" },
    { codename: "edit_blogpost",    name: "Can edit all blog posts",   object_type: "blogpost" },
    { codename: "publish_blogpost", name: "Can publish blog posts",    object_type: "blogpost" },
    { codename: "delete_blogpost",  name: "Can delete blog posts",     object_type: "blogpost" },
    { codename: "upload_media",     name: "Can upload media",          object_type: "media" },
    { codename: "delete_media",     name: "Can delete media",          object_type: "media" },
    { codename: "edit_settings",    name: "Can edit site settings",    object_type: "settings" },
    { codename: "manage_users",     name: "Can manage users/groups",   object_type: "user" },
  ];

  // SQLite NULL != NULL in UNIQUE constraints, so INSERT OR IGNORE won't deduplicate
  // type-level permissions (object_id IS NULL). Use existence check instead.
  const insertPerm = db.prepare(
    `INSERT INTO permissions (codename, name, object_type, object_id)
     SELECT ?, ?, ?, NULL
     WHERE NOT EXISTS (
       SELECT 1 FROM permissions WHERE codename = ? AND object_type = ? AND object_id IS NULL
     )`
  );
  for (const p of TYPE_LEVEL_PERMISSIONS) {
    insertPerm.run(p.codename, p.name, p.object_type, p.codename, p.object_type);
  }

  // Deduplicate any already-existing duplicates from prior runs
  db.run(`
    DELETE FROM permissions
    WHERE id NOT IN (
      SELECT MIN(id) FROM permissions
      GROUP BY codename, object_type, COALESCE(CAST(object_id AS TEXT), '__null__')
    )
  `);

  // Default groups
  const groups = [
    { name: "Administrators", description: "Full access to all CMS features" },
    { name: "Editors",        description: "Can edit pages, blog posts, and upload media" },
    { name: "Authors",        description: "Can write and publish their own blog posts" },
  ];
  const insertGroup = db.prepare("INSERT OR IGNORE INTO groups (name, description) VALUES (?, ?)");
  for (const g of groups) insertGroup.run(g.name, g.description);

  // Assign permissions to groups — idempotent via INSERT OR IGNORE
  const assignPerms = (groupName, codenames) => {
    const group = db.prepare("SELECT id FROM groups WHERE name = ?").get(groupName);
    if (!group) return;
    const insertGP = db.prepare(
      `INSERT OR IGNORE INTO group_permissions (group_id, permission_id)
       SELECT ?, id FROM permissions WHERE codename = ? AND object_id IS NULL`
    );
    for (const codename of codenames) insertGP.run(group.id, codename);
  };

  assignPerms("Administrators", TYPE_LEVEL_PERMISSIONS.map(p => p.codename));
  assignPerms("Editors", [
    "view_page", "edit_page",
    "view_blogpost", "edit_blogpost", "publish_blogpost",
    "upload_media",
  ]);
  assignPerms("Authors", ["edit_blogpost", "upload_media"]);
}

export function getDB() {
  if (!db) throw new Error("DB not initialized. Call initDB() first.");
  return db;
}

export function getSetting(key) {
  const row = getDB().prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : null;
}
