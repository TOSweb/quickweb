export default {
  env: "production",
  debug: false,
  port: process.env.PORT || 8080,
  domain: process.env.DOMAIN,
  siteUrl: process.env.SITE_URL,

  db: {
    path: process.env.DB_PATH || "./data/cms.db",
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
