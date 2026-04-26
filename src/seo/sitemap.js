// src/seo/sitemap.js — sitemap.xml + robots.txt
import { getDB, getSetting } from "../db.js";
import { getContentTypes } from "../core/plugins.js";
import config from "../config.js";

let cachedSitemap = null;
let cacheTime = 0;

export function invalidateSitemap() {
  cachedSitemap = null;
  cacheTime = 0;
}

export async function serveSitemap() {
  const ttl = (config.cache?.sitemapTtlSeconds ?? 3600) * 1000;
  if (cachedSitemap && Date.now() - cacheTime < ttl) {
    return new Response(cachedSitemap, {
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    });
  }

  const xml = await generateSitemapXml();
  cachedSitemap = xml;
  cacheTime = Date.now();

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}

export function serveRobots() {
  const siteUrl = getSetting("site_url") || config.siteUrl || "";
  const txt = `User-agent: *\nAllow: /\nDisallow: /admin/\nSitemap: ${siteUrl}/sitemap.xml\n`;
  return new Response(txt, { headers: { "Content-Type": "text/plain" } });
}

async function generateSitemapXml() {
  const db = getDB();
  const siteUrl = getSetting("site_url") || config.siteUrl || "";
  const includePages = getSetting("sitemap_include_pages") !== "0";
  const includePosts = getSetting("sitemap_include_posts") !== "0";

  const urls = [];
  urls.push({ loc: siteUrl + "/", priority: "1.0", changefreq: "weekly" });

  if (includePages) {
    const pages = await db.all(
      "SELECT slug, updated_at FROM pages WHERE status='published' ORDER BY updated_at DESC"
    );
    for (const p of pages) {
      if (!p.slug) continue;
      urls.push({ loc: `${siteUrl}/${p.slug}`, lastmod: isoDate(p.updated_at), priority: "0.8", changefreq: "monthly" });
    }
  }

  if (includePosts) {
    const posts = await db.all(
      "SELECT slug, updated_at FROM blog_posts WHERE status='published' ORDER BY updated_at DESC"
    );
    for (const p of posts) {
      urls.push({ loc: `${siteUrl}/blog/${p.slug}`, lastmod: isoDate(p.updated_at), priority: "0.6", changefreq: "never" });
    }
  }

  // Content type list + detail URLs
  for (const ct of getContentTypes()) {
    if (!ct.hasPublicUrls) continue;
    urls.push({ loc: `${siteUrl}/${ct.slug}`, priority: "0.8", changefreq: "weekly" });
    try {
      const items = await db.all(
        `SELECT slug, updated_at FROM ${ct.table} WHERE status='published' AND slug IS NOT NULL AND slug != ''`
      );
      for (const item of items) {
        urls.push({ loc: `${siteUrl}/${ct.slug}/${item.slug}`, lastmod: isoDate(item.updated_at), priority: "0.6", changefreq: "monthly" });
      }
    } catch {}
  }

  const urlEntries = urls.map(u => `  <url>
    <loc>${escXml(u.loc)}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}
    <priority>${u.priority}</priority>
    <changefreq>${u.changefreq}</changefreq>
  </url>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;
}

function isoDate(dateStr) {
  if (!dateStr) return "";
  try { return new Date(dateStr).toISOString().split("T")[0]; } catch { return ""; }
}

function escXml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
