import { getDB, initDB } from "../src/db.js";

async function run() {
  await initDB();
  const db = getDB();

  console.log("Starting Services Slug Migration...");
  
  try {
    await db.exec(`ALTER TABLE services ADD COLUMN slug TEXT`);
    console.log(`✓ Added column: slug to services table.`);
  } catch (e) {
    if (e.message.includes("duplicate column name")) {
      console.log(`- Column already exists: slug`);
    } else if (e.message.includes("no such table")) {
      console.log(`- Services table does not exist yet.`);
    } else {
      console.error(`! Failed adding slug:`, e.message);
    }
  }

  console.log("Migration finished successfully.");
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
