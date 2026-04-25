import { readdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { join } from "path";

const root = process.cwd();
const ignoreList = ["node_modules", ".git", "data", "dist", ".claude", ".gemini", "bun.lockb", "bun.lock"];

function walkAndReplace(dir) {
  const files = readdirSync(dir);
  for (const file of files) {
    if (ignoreList.includes(file)) continue;
    
    const fullPath = join(dir, file);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      walkAndReplace(fullPath);
    } else if (stat.isFile()) {
      // Only modify text files
      if (!fullPath.match(/\.(js|json|md|html|njk|css|txt)$/i)) continue;

      let content = readFileSync(fullPath, "utf8");
      let originalContent = content;
      
      // Case sensitive replacements
      content = content.replace(/Veave CMS/g, "Veave CMS");
      content = content.replace(/Veave CMS/g, "Veave CMS");
      content = content.replace(/veavecms/g, "veavecms");
      // Specific instances like "Veave CMS" -> "Veave CMS" are handled
      
      if (content !== originalContent) {
        writeFileSync(fullPath, content, "utf8");
        console.log("Updated:", fullPath);
      }
    }
  }
}

walkAndReplace(root);
