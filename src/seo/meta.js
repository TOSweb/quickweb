// src/seo/meta.js — Build <head> SEO tags for pages and blog posts
import { getSetting } from "../db.js";

export function buildMeta({ page, post, siteUrl } = {}) {
  const obj = page || post;
  if (!obj) return "";

  const base = siteUrl || getSetting("site_url") || "";
  const siteTitle = getSetting("site_title") || "";
  const isPost = !!post;

  const title = obj.seo_title || obj.title || "";
  const description = obj.meta_description || obj.excerpt || "";
  const slug = obj.slug || "";
  const canonical = obj.canonical_url || (isPost ? `${base}/blog/${slug}` : `${base}/${slug}`);
  const ogTitle = obj.og_title || title;
  const ogDesc = obj.og_description || description;
  const ogImage = obj.og_image || obj.featured_image || "";
  const ogImageAlt = obj.featured_image_alt || title;

  const favicon = getSetting("favicon");

  const parts = [
    favicon ? `<link rel="icon" href="${esc(favicon)}">` : "",
    `<title>${esc(title)}${siteTitle ? ` — ${esc(siteTitle)}` : ""}</title>`,
    description ? `<meta name="description" content="${esc(description)}">` : "",
    `<link rel="canonical" href="${esc(canonical)}">`,
    "",
    `<meta property="og:title" content="${esc(ogTitle)}">`,
    ogDesc ? `<meta property="og:description" content="${esc(ogDesc)}">` : "",
    ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : "",
    ogImage ? `<meta property="og:image:alt" content="${esc(ogImageAlt)}">` : "",
    `<meta property="og:type" content="${isPost ? "article" : "website"}">`,
    `<meta property="og:url" content="${esc(canonical)}">`,
    siteTitle ? `<meta property="og:site_name" content="${esc(siteTitle)}">` : "",
    "",
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(ogTitle)}">`,
    ogDesc ? `<meta name="twitter:description" content="${esc(ogDesc)}">` : "",
    ogImage ? `<meta name="twitter:image" content="${esc(ogImage)}">` : "",
  ];

  const customHead = getSetting("custom_head") || "";
  const gaId = getSetting("google_analytics_id") || "";

  const analyticsScript = gaId ? `
<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(gaId)}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${esc(gaId)}');
</script>` : "";

  let output = parts.filter(Boolean).join("\n  ");
  if (customHead) output += "\n  " + customHead.trim();
  if (analyticsScript) output += "\n  " + analyticsScript.trim();
  
  return output;
}

function esc(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
