export default {
  env: "production",
  debug: false,
  port: process.env.PORT || 8080,
  domain: process.env.DOMAIN,
  siteUrl: process.env.SITE_URL,

  db: {
    // Auto-detect MySQL when DB_HOST + DB_USER + DB_NAME are all set; fall back to SQLite
    driver: (process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME) ? "mysql" : (process.env.DB_DRIVER || "sqlite"),
    // SQLite
    path: process.env.DB_PATH || "./data/cms.db",
    // MySQL — just set DB_HOST, DB_USER, DB_NAME and DB_PASSWORD; no DB_DRIVER needed
    host:            process.env.DB_HOST     || "localhost",
    port:            parseInt(process.env.DB_PORT || "3306"),
    database:        process.env.DB_NAME     || "buncms",
    user:            process.env.DB_USER,
    password:        process.env.DB_PASSWORD,
    connectionLimit: parseInt(process.env.DB_POOL_SIZE || "10"),
  },

  security: {
    sessionSecret: process.env.SESSION_SECRET,
    hmacSecret: process.env.HMAC_SECRET,
    csrfSecret: process.env.CSRF_SECRET,
    cookieSecure: true,
    cookieSameSite: "Strict",
    hsts: true,
    hstsMaxAge: 31536000,
  },

  uploads: {
    maxSizeMb: 10,
    path: process.env.UPLOAD_PATH || "./data/uploads",
    allowedMimeTypes: [
      "image/jpeg", "image/png", "image/webp",
      "image/gif", "image/svg+xml",
      "application/pdf",
    ],
  },

  rateLimit: {
    loginMaxAttempts: 5,
    loginWindowMinutes: 15,
    loginLockoutMinutes: 30,
  },

  cache: {
    sitemapTtlSeconds: 3600,
    templateCache: true,
  },

  debug_settings: {
    showSqlErrors: false,
    showStackTraces: false,
    logRequests: false,
  }
};
