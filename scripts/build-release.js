import { $ } from "bun";

console.log("Packaging MyCMS for cPanel/hPanel deployment...");

// Remove existing zip
await $`rm -f mycms-release.zip`.nothrow();

// Zip the necessary directories and files
// Exclude local .env, data folder contents (except the folder itself if needed), git, and node_modules
await $`zip -r mycms-release.zip src themes config plugins scripts package.json README.md -x "config/.env*" "data/*" "node_modules/*" "*.git*" "*.DS_Store"`;

console.log("-----------------------------------------");
console.log("✅ Done! Created mycms-release.zip");
console.log("Upload this file to your cPanel File Manager, extract it, and setup a Node.js App pointing to src/index.js.");
