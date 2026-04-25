import { $ } from "bun";

console.log("Packaging Veave CMS for cPanel/hPanel deployment...");

// Remove existing zip
await $`rm -f veavecms-release.zip`.nothrow();

// Zip the necessary directories and files
// Exclude local .env, data folder contents (except the folder itself if needed), git, and node_modules
await $`zip -r veavecms-release.zip src themes config plugins scripts package.json README.md -x "config/.env*" "data/*" "node_modules/*" "*.git*" "*.DS_Store"`;

console.log("-----------------------------------------");
console.log("✅ Done! Created veavecms-release.zip");
console.log("Upload this file to your cPanel File Manager, extract it, and setup a Node.js App pointing to src/index.js.");
