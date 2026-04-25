export default {
  env: "development",
  debug: true,
  port: 8000,
  domain: "localhost",
  siteUrl: "http://localhost:8000",

  db: {
    path: "./data/cms-dev.db",
  },

  security: {
    sessionSecret: process.env.SESSION_SECRET,
    hmacSecret: process.env.HMAC_SECRET,
    csrfSecret: process.env.CSRF_SECRET,
    cookieSecure: false,
    cookieSameSite: "Lax",
  },

  uploads: {
    maxSizeMb: 10,
    path: "./data/uploads",
    allowedMimeTypes: [
      "image/jpeg", "image/png", "image/webp",
      "image/gif", "image/svg+xml",
      "application/pdf",
    ],
  },

  rateLimit: {
    loginMaxAttempts: 10,
    loginWindowMinutes: 5,
    loginLockoutMinutes: 5,
  },

  cache: {
    sitemapTtlSeconds: 60,
    templateCache: false,
  },

  debug_settings: { // Renamed from 'debug' to avoid conflict with the boolean
    showSqlErrors: true,
    showStackTraces: true,
    logRequests: true,
  }
};
