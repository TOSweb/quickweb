'use strict';
// LiteSpeed (cPanel) loads Node.js apps via require() which can't handle ESM top-level await.
// This CJS wrapper uses dynamic import() to bridge the gap.

// Node.js requires absolute URLs in Response.redirect(); Bun accepts relative paths.
// Patch the global so all our relative redirects work without touching every call site.
const _origRedirect = Response.redirect.bind(Response);
Response.redirect = function patchedRedirect(url, status) {
  if (typeof url === 'string' && url.startsWith('/')) {
    const base = process.env.SITE_URL || `http://localhost:${process.env.PORT || 8080}`;
    url = base.replace(/\/$/, '') + url;
  }
  return _origRedirect(url, status);
};

import('./src/index.js').catch(err => {
  console.error('[STARTUP ERROR]', err);
  process.exit(1);
});
