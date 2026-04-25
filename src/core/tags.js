// src/core/tags.js — Template tag registry
const registry = new Map();

export function registerTag(name, handler, options = {}) {
  registry.set(name, { handler, block: !!options.block });
}

export function getTag(name) {
  return registry.get(name) || null;
}

export function hasTag(name) {
  return registry.has(name);
}

// Parse "key=value key2='val2' key3=123" into a plain object.
// Values can be unquoted (no spaces), single-quoted, or double-quoted.
export function parseTagAttrs(attrString) {
  const attrs = {};
  const re = /(\w+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let m;
  while ((m = re.exec(attrString)) !== null) {
    const key = m[1];
    const value = m[2] ?? m[3] ?? m[4];
    attrs[key] = isNaN(value) ? value : Number(value);
  }
  return attrs;
}

// Render a tag string like "{% recentposts limit=5 %}" against the registry.
// ctx is the current template context (page, post, session, etc.)
export async function renderTag(tagString, ctx = {}) {
  // Match {% tagname attrs %} or {% tagname %} with optional block body
  const match = tagString.match(/^\{%[-\s]*(\w+)(.*?)[-\s]*%\}([\s\S]*?)(?:\{%[-\s]*end\1[-\s]*%\})?$/s);
  if (!match) return `<!-- malformed tag: ${tagString} -->`;

  const [, name, attrStr, body] = match;
  const tag = getTag(name);
  if (!tag) return `<!-- unknown tag: ${name} -->`;

  const attrs = parseTagAttrs(attrStr.trim());

  try {
    if (tag.block) {
      return await tag.handler(attrs, body?.trim() ?? "", ctx);
    }
    return await tag.handler(attrs, ctx);
  } catch (err) {
    console.error(`Tag "${name}" error:`, err.message);
    return "";
  }
}

// Process all {% ... %} tags in a string (non-block only).
// Used for rendering dynamic component content fields.
export async function processTemplateTags(html, ctx = {}) {
  const tagPattern = /\{%[-\s]*(\w+)([^%]*)[-\s]*%\}/g;
  const matches = [...html.matchAll(tagPattern)];
  if (!matches.length) return html;

  let result = html;
  for (const match of matches) {
    const [full, name, attrStr] = match;
    const tag = getTag(name);
    if (!tag || tag.block) continue;
    const attrs = parseTagAttrs(attrStr.trim());
    try {
      const output = await tag.handler(attrs, ctx);
      result = result.replace(full, output);
    } catch (err) {
      console.error(`Tag "${name}" error:`, err.message);
      result = result.replace(full, "");
    }
  }
  return result;
}
