// test_router.js
import { router } from "./src/router.js";
import { initDB } from "./src/db.js";
import { initTheme } from "./src/core/theme.js";

async function test() {
  await initDB();
  initTheme();
  
  const req = new Request("http://localhost:8080/admin/setup");
  const res = await router(req);
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Body length:", text.length);
}

test().catch(console.error);
