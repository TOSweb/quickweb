import { $ } from "bun";

const OUT = "veave.tar.gz";

console.log("Packaging Veave CMS for deployment...");

await $`rm -f ${OUT}`.nothrow();

await $`tar -czf ${OUT} \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='data' \
  --exclude='.env*' \
  --exclude='*.DS_Store' \
  --exclude='veave.zip' \
  --exclude='veave.tar.gz' \
  src config themes plugins package.json bun.lock server.cjs`;

console.log(`✅ Created ${OUT}`);
console.log("Upload this file to cPanel File Manager → Extract Here.");
console.log("Use .tar.gz (not .zip) — avoids antivirus false positives on shared hosting.");
