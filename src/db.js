// src/db.js
import config from "./config.js";

let adapter;
const settingsCache = new Map();
const isMysql = config.db?.driver === "mysql";

// Adapt DDL: SQLite uses AUTOINCREMENT, MySQL uses AUTO_INCREMENT
function ddl(sql) {
  if (!isMysql) return sql;
  return sql.replace(/\bAUTOINCREMENT\b/g, "AUTO_INCREMENT");
}

export async function initDB() {
  if (isMysql) {
    const { createMySQLAdapter } = await import("./db/mysql.js");
    adapter = createMySQLAdapter(config.db);
  } else {
    const { createSQLiteAdapter } = await import("./db/sqlite.js");
    adapter = createSQLiteAdapter(config.db);
  }

  await createTables();
  await seedInitialData();
  await seedPermissionsAndGroups();
  await refreshSettingsCache();

  console.log(`✓ Database initialized (${isMysql ? `MySQL:${config.db.database}` : `SQLite:${config.db.path}`})`);
}

async function createTables() {
  await adapter.exec(ddl(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    is_superuser INTEGER DEFAULT 0,
    last_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`));

  await adapter.exec(ddl(`CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`));

  await adapter.exec(ddl(`CREATE TABLE IF NOT EXISTS user_groups (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, group_id)
  )`));

  await adapter.exec(ddl(`CREATE TABLE IF NOT EXISTS permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codename TEXT NOT NULL,
    name TEXT NOT NULL,
    object_type TEXT NOT NULL,
    object_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(codename, object_type, object_id)
  )`));

  await adapter.exec(ddl(`CREATE TABLE IF NOT EXISTS group_permissions (
    group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, permission_id)
  )`));

  await adapter.exec(ddl(`CREATE TABLE IF NOT EXISTS user_permissions (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, permission_id)
  )`));

  await adapter.exec(ddl(`CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    username TEXT,
    success INTEGER DEFAULT 0,
    attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`));

  await adapter.exec(ddl(`CREATE TABLE IF NOT EXISTS pages (
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
  )`));

  await adapter.exec(ddl(`CREATE TABLE IF NOT EXISTS components (
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
  )`));

  await adapter.exec(ddl(`CREATE TABLE IF NOT EXISTS page_components (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id INTEGER REFERENCES pages(id) ON DELETE CASCADE,
    component_id INTEGER REFERENCES components(id) ON DELETE RESTRICT,
    sort_order INTEGER DEFAULT 0,
    UNIQUE(page_id, component_id)
  )`));

  await adapter.exec(ddl(`CREATE TABLE IF NOT EXISTS redirects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_url TEXT UNIQUE NOT NULL,
    to_url TEXT NOT NULL,
    status_code INTEGER DEFAULT 301,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`));

  await adapter.exec(ddl(`CREATE TABLE IF NOT EXISTS blog_posts (
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
  )`));

  await adapter.exec(ddl(`CREATE TABLE IF NOT EXISTS blog_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    meta_description TEXT
  )`));

  await adapter.exec(ddl(`CREATE TABLE IF NOT EXISTS blog_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL
  )`));

  await adapter.exec(ddl(`CREATE TABLE IF NOT EXISTS blog_post_categories (
    post_id INTEGER REFERENCES blog_posts(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES blog_categories(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, category_id)
  )`));

  await adapter.exec(ddl(`CREATE TABLE IF NOT EXISTS blog_post_tags (
    post_id INTEGER REFERENCES blog_posts(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES blog_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, tag_id)
  )`));

  await adapter.exec(ddl(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`));

  await adapter.exec(ddl(`CREATE TABLE IF NOT EXISTS media (
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
  )`));

  await adapter.exec(ddl(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    data TEXT,
    expires_at DATETIME NOT NULL
  )`));
}

async function seedInitialData() {
  const defaults = [
    ["site_title",            "Veave CMS Site"],
    ["site_tagline",          "Built with Bun"],
    ["active_theme",          "default"],
    ["posts_per_page",        "10"],
    ["cms_version",           "1.0.0"],
    ["google_analytics_id",   ""],
    ["sitemap_include_pages", "1"],
    ["sitemap_include_posts", "1"],
  ];
  for (const [key, value] of defaults) {
    await adapter.run(
      "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
      [key, value]
    );
  }
}

async function seedPermissionsAndGroups() {
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

  // EXISTS-check insert — works identically in SQLite and MySQL (NULL != NULL in UNIQUE)
  for (const p of TYPE_LEVEL_PERMISSIONS) {
    await adapter.run(
      `INSERT INTO permissions (codename, name, object_type, object_id)
       SELECT ?, ?, ?, NULL
       WHERE NOT EXISTS (
         SELECT 1 FROM permissions WHERE codename = ? AND object_type = ? AND object_id IS NULL
       )`,
      [p.codename, p.name, p.object_type, p.codename, p.object_type]
    );
  }

  // Dedup any duplicates from prior runs — MySQL needs a derived table to self-reference
  if (isMysql) {
    await adapter.run(`
      DELETE FROM permissions WHERE id NOT IN (
        SELECT min_id FROM (
          SELECT MIN(id) AS min_id FROM permissions
          GROUP BY codename, object_type, IFNULL(object_id, -1)
        ) AS tmp
      )
    `);
  } else {
    await adapter.run(`
      DELETE FROM permissions WHERE id NOT IN (
        SELECT MIN(id) FROM permissions
        GROUP BY codename, object_type, IFNULL(object_id, -1)
      )
    `);
  }

  const groups = [
    { name: "Administrators", description: "Full access to all CMS features" },
    { name: "Editors",        description: "Can edit pages, blog posts, and upload media" },
    { name: "Authors",        description: "Can write and publish their own blog posts" },
  ];
  for (const g of groups) {
    await adapter.run(
      "INSERT OR IGNORE INTO groups (name, description) VALUES (?, ?)",
      [g.name, g.description]
    );
  }

  const assignPerms = async (groupName, codenames) => {
    const group = await adapter.get("SELECT id FROM groups WHERE name = ?", [groupName]);
    if (!group) return;
    for (const codename of codenames) {
      await adapter.run(
        `INSERT OR IGNORE INTO group_permissions (group_id, permission_id)
         SELECT ?, id FROM permissions WHERE codename = ? AND object_id IS NULL`,
        [group.id, codename]
      );
    }
  };

  await assignPerms("Administrators", TYPE_LEVEL_PERMISSIONS.map(p => p.codename));
  await assignPerms("Editors", [
    "view_page", "edit_page",
    "view_blogpost", "edit_blogpost", "publish_blogpost",
    "upload_media",
  ]);
  await assignPerms("Authors", ["edit_blogpost", "upload_media"]);
}

async function refreshSettingsCache() {
  const rows = await adapter.all("SELECT key, value FROM settings");
  settingsCache.clear();
  for (const row of rows) settingsCache.set(row.key, row.value);
}

export function getDB() {
  if (!adapter) throw new Error("DB not initialized. Call initDB() first.");
  return adapter;
}

// Synchronous — reads from in-memory cache populated at startup.
// Nunjucks globals and other sync callers rely on this staying synchronous.
export function getSetting(key) {
  return settingsCache.get(key) ?? null;
}

// Write a setting to the DB and update the in-memory cache.
export async function setSetting(key, value) {
  const v = value ?? "";
  await adapter.run(
    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
    [key, v]
  );
  settingsCache.set(key, v);
}
