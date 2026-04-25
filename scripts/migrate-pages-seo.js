import { getDB, initDB } from "../src/db.js";

async function run() {
  await initDB();
  const db = getDB();

  console.log("Starting Pages SEO Schema Migration...");
  
  const columns = [
    "seo_title TEXT",
    "meta_description TEXT",
    "og_title TEXT",
    "og_description TEXT",
    "og_image TEXT",
    "schema_type TEXT DEFAULT 'WebPage'"
  ];

  for (const col of columns) {
    try {
      await db.exec(`ALTER TABLE pages ADD COLUMN ${col}`);
      console.log(`✓ Added column: ${col}`);
    } catch (e) {
      if (e.message.includes("duplicate column name")) {
        console.log(`- Column already exists: ${col}`);
      } else {
        console.error(`! Failed adding ${col}:`, e.message);
      }
    }
  }

  console.log("Migration finished successfully.");
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
