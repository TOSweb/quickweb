// src/config.js
const env = process.env.NODE_ENV || "development";
const configModule = await import(`../config/${env}.js`);
const config = configModule.default;

// Check if critical secrets are set. If not, the CMS enters Setup Mode.
const sec = config.security || {};
config.isSetupRequired = !sec.sessionSecret || !sec.hmacSecret || !sec.csrfSecret;

export default config;
