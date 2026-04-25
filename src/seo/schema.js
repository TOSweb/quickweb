// src/seo/schema.js — JSON-LD structured data
import { getSetting, getDB } from "../db.js";

export async function buildSchema({ post, page, siteUrl } = {}) {
  const base = siteUrl || getSetting("site_url") || "";
  const siteTitle = getSetting("site_title") || "";

  if (post) {
    const author = post.author_id
      ? await getDB().get("SELECT username FROM users WHERE id = ?", [post.author_id])
      : null;

    const schema = {
      "@context": "https://schema.org",
      "@type": post.schema_type || "BlogPosting",
      headline: post.title,
      description: post.meta_description || post.excerpt || undefined,
      image: post.og_image || post.featured_image || undefined,
      author: { "@type": "Person", name: author?.username || siteTitle },
      publisher: { "@type": "Organization", name: siteTitle },
      datePublished: post.publish_at || post.created_at,
      dateModified: post.updated_at || post.created_at,
      mainEntityOfPage: `${base}/blog/${post.slug}`,
      url: post.canonical_url || `${base}/blog/${post.slug}`,
    };

    return jsonLdTag(cleanObj(schema));
  }

  if (page) {
    const schema = {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: page.title,
      description: page.meta_description || undefined,
      url: page.canonical_url || `${base}/${page.slug}`,
    };
    return jsonLdTag(cleanObj(schema));
  }

  return "";
}

function jsonLdTag(obj) {
  return `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2)}\n</script>`;
}

function cleanObj(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}
