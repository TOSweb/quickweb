// index.js — entry point
import config from "./config.js";
import { initDB } from "./db.js";
import { initTheme } from "./core/theme.js";
import { loadPlugins, loadCoreContentTypes } from "./core/plugins.js";
import { registerBuiltins } from "./core/builtins.js";
import { router } from "./router.js";
import { securityHeaders } from "./core/headers.js";

async function start() {
  console.log(`⬡  Veave CMS starting [${config.env}]...`);

  await initDB();
  initTheme();
  registerBuiltins();
  await loadPlugins();
  await loadCoreContentTypes();

  const isBun = typeof Bun !== "undefined";
  const port = config.port || 8080;

  if (isBun) {
    Bun.serve({ 
      port, 
      hostname: "0.0.0.0",
      fetch: async (req) => {
        console.log(`[Server] ${req.method} ${req.url}`);
        try {
          const response = await router(req);
          return securityHeaders(response, config);
        } catch (err) {
          console.error("SERVER ERROR:", err);
          return errorResponse(err, config);
        }
      }
    });
  } else {
    // Node.js fallback via http module
    const { createServer } = await import("http");
    createServer(async (req, res) => {
      const url = `${config.siteUrl}${req.url}`;
      const bunReq = new Request(url, {
        method: req.method,
        headers: req.headers,
        body: ["GET", "HEAD"].includes(req.method) ? null : req,
      });
      const response = await router(bunReq);
      const securedResponse = securityHeaders(response, config);
      
      res.writeHead(securedResponse.status, Object.fromEntries(securedResponse.headers));
      const body = await securedResponse.arrayBuffer();
      res.end(Buffer.from(body));
    }).listen(port);
  }

  console.log(`✓ Running at ${config.siteUrl}`);
}

function errorResponse(err, cfg) {
  if (cfg.debug?.showStackTraces) {
    const html = `<!DOCTYPE html><html><head><title>500 Error</title>
    <style>body{font-family:monospace;padding:40px;background:#1e293b;color:#f1f5f9}
    h1{color:#ef4444}pre{background:#0f172a;padding:20px;border-radius:8px;overflow:auto;font-size:13px}</style>
    </head><body><h1>500 — Internal Server Error</h1>
    <p>${err.message}</p><pre>${err.stack || ""}</pre></body></html>`;
    return new Response(html, { status: 500, headers: { "Content-Type": "text/html" } });
  }
  const html = `<!DOCTYPE html><html><head><title>500</title>
  <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f4f7f6}
  .box{text-align:center;padding:60px;background:white;border-radius:24px;max-width:400px}
  h1{font-size:72px;margin:0;color:#154d37}p{color:#64748b}</style>
  </head><body><div class="box"><h1>500</h1><p>Something went wrong. Please try again later.</p></div></body></html>`;
  return new Response(html, { status: 500, headers: { "Content-Type": "text/html" } });
}

start().catch(console.error);
