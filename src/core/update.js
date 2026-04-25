// src/core/update.js — Self-update mechanism
// Checks the project's package.json version against a remote registry entry.
// In production, ship the compiled binary so this just reports the current version.
import { readFileSync } from "fs";
import { join } from "path";

let _currentVersion = null;

export function getCurrentVersion() {
  if (_currentVersion) return _currentVersion;
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8"));
    _currentVersion = pkg.version || "0.0.0";
  } catch {
    _currentVersion = "0.0.0";
  }
  return _currentVersion;
}

// Check npm registry for a newer version. Returns { current, latest, hasUpdate }.
// Fails silently — never blocks the server.
export async function checkForUpdate(packageName = "veavecms") {
  const current = getCurrentVersion();
  try {
    const res = await fetch(`https://registry.npmjs.org/${packageName}/latest`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { current, latest: null, hasUpdate: false };
    const data = await res.json();
    const latest = data.version || current;
    const hasUpdate = compareVersions(latest, current) > 0;
    return { current, latest, hasUpdate };
  } catch {
    return { current, latest: null, hasUpdate: false };
  }
}

// Simple semver compare: returns 1 if a > b, -1 if a < b, 0 if equal.
function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}
