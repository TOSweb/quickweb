// src/core/headers.js

export function securityHeaders(response, config) {
  if (!(response instanceof Response)) {
    console.error("securityHeaders: object is not an instance of Response", response);
    return response;
  }

  // Set headers on the existing response object
  // Browsers/Bun usually allow this before the response is sent
  try {
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Content-Security-Policy", buildCsp(config));
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

    if (config.security && config.security.hsts) {
      response.headers.set(
        "Strict-Transport-Security",
        `max-age=${config.security.hstsMaxAge}; includeSubDomains`
      );
    }
  } catch (e) {
    // If the response is immutable (e.g. from some fetch results), we must clone it
    console.warn("Response headers are immutable, creating a new response wrapper.");
    const headers = new Headers(response.headers);
    headers.set("X-Frame-Options", "DENY");
    headers.set("Content-Security-Policy", buildCsp(config));
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  return response;
}

function buildCsp(config) {
  const directives = [
    "default-src 'self'",
    // 'unsafe-inline' is required for the inline editor; https: allows CDN scripts
    // that users embed in imported components (Tailwind, Alpine, etc.)
    "script-src 'self' 'unsafe-inline' https:",
    // https: allows CDN stylesheets and Google Fonts CSS
    "style-src 'self' 'unsafe-inline' https:",
    "img-src 'self' data: blob: https:",
    // https: allows Google Fonts and any other web font CDN
    "font-src 'self' https:",
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  return directives.join("; ");
}
