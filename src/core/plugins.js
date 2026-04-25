// src/core/plugins.js
import { registerTag } from "./tags.js";
import { getDB } from "../db.js";
import { join } from "path";
import { readdirSync, existsSync } from "fs";

const actionHooks = new Map();   // hook -> [fn, ...]
const filterHooks = new Map();   // hook -> [fn, ...]
const loadedPlugins = [];
const contentTypes = [];         // registered via addContentType()

export function getContentTypes() { return [...contentTypes]; }

export async function loadPlugins() {
  const pluginsDir = join(process.cwd(), "plugins");
  if (!existsSync(pluginsDir)) {
    console.log("✓ Plugins loaded (0 active)");
    return;
  }

  const entries = readdirSync(pluginsDir, { withFileTypes: true });
  const pluginDirs = entries.filter(e => e.isDirectory());

  for (const entry of pluginDirs) {
    const indexPath = join(pluginsDir, entry.name, "index.js");
    if (!existsSync(indexPath)) continue;

    try {
      const mod = await import(indexPath);
      if (typeof mod.register !== "function") continue;

      await mod.register({
        addTag: (name, handler, opts) => registerTag(name, handler, opts),
        addTemplateFilter,
        addAction: (hook, fn) => {
          if (!actionHooks.has(hook)) actionHooks.set(hook, []);
          actionHooks.get(hook).push(fn);
        },
        addFilter: (hook, fn) => {
          if (!filterHooks.has(hook)) filterHooks.set(hook, []);
          filterHooks.get(hook).push(fn);
        },
        addContentType: (def) => {
          if (!def.slug || !def.table || !def.fields) {
            console.warn(`Plugin "${entry.name}" addContentType() missing required fields (slug, table, fields)`);
            return;
          }
          contentTypes.push(def);
        },
        getDB,
      });

      loadedPlugins.push(entry.name);
    } catch (err) {
      console.error(`Plugin "${entry.name}" failed to load:`, err.message);
    }
  }

  console.log(`✓ Plugins loaded (${loadedPlugins.length} active${loadedPlugins.length ? ": " + loadedPlugins.join(", ") : ""})`);
}

// Called by plugins to add Nunjucks template filters.
// theme.js exposes setFilterAdder() after initTheme() so this works
// regardless of import order.
let _addNunjucksFilter = null;
export function setFilterAdder(fn) { _addNunjucksFilter = fn; }

function addTemplateFilter(name, fn) {
  if (_addNunjucksFilter) {
    _addNunjucksFilter(name, fn);
  } else {
    console.warn(`Plugin filter "${name}" registered before theme init — ignored.`);
  }
}

// Fire all registered action hooks for a given event.
export async function fireAction(hook, payload) {
  const fns = actionHooks.get(hook) || [];
  for (const fn of fns) {
    try { await fn(payload); } catch (err) { console.error(`Action hook "${hook}" error:`, err.message); }
  }
}

// Run all registered filter hooks for a given value, chaining output.
export async function applyFilter(hook, value, ...args) {
  const fns = filterHooks.get(hook) || [];
  let result = value;
  for (const fn of fns) {
    try { result = await fn(result, ...args); } catch (err) { console.error(`Filter hook "${hook}" error:`, err.message); }
  }
  return result;
}

export function getLoadedPlugins() { return [...loadedPlugins]; }
