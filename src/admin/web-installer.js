import config from "../config.js";
import { randomBytes } from "crypto";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// Reuse the Donezo style layout for consistency
function installerLayout(title, content) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} — MyCMS Installer</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #154d37;
            --bg: #f4f7f6;
            --white: #ffffff;
            --radius: 32px;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
            font-family: 'Outfit', sans-serif; 
            background: var(--bg); 
            display: flex; 
            justify-content: center; 
            align-items: center; 
            height: 100vh;
            padding: 20px;
        }
        .auth-card { 
            background: var(--white); 
            padding: 50px; 
            border-radius: var(--radius); 
            box-shadow: 0 20px 40px rgba(0,0,0,0.05); 
            width: 100%; 
            max-width: 500px;
            text-align: center;
        }
        .brand { font-size: 28px; font-weight: 700; margin-bottom: 20px; color: var(--primary); }
        .brand span { background: var(--primary); color: white; padding: 0 10px; border-radius: 8px; margin-right: 8px; }
        
        h1 { font-size: 24px; margin-bottom: 20px; font-weight: 700; }
        p { color: #64748b; line-height: 1.6; margin-bottom: 30px; font-size: 15px; }
        
        button { 
            width: 100%; padding: 16px; background: var(--primary); color: white; 
            border: none; border-radius: 20px; font-weight: 700; font-size: 16px;
            cursor: pointer; transition: 0.3s;
        }
        button:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(21, 77, 55, 0.2); }
        
        .logs { text-align: left; background: #1e293b; color: #cbd5e1; padding: 15px; border-radius: 12px; font-family: monospace; font-size: 12px; margin-bottom: 25px; }
    </style>
</head>
<body>
    <div class="auth-card">
        <div class="brand"><span>M</span> MyCMS</div>
        ${content}
    </div>
</body>
</html>`;
}

export async function webInstallerPage(req) {
  const content = `
    <h1>Welcome to MyCMS</h1>
    <p>It looks like this is a fresh installation. We need to generate cryptographic secrets and set up your environment configuration before proceeding.</p>
    
    <div class="logs">
        > Environment: ${config.env}<br>
        > Secrets missing: True<br>
        > Action: Create .env
    </div>

    <form method="POST" action="/setup-installer">
        <button type="submit">Auto-Generate Configuration</button>
    </form>
  `;
  return new Response(installerLayout("5-Minute Install", content), { headers: { "Content-Type": "text/html" } });
}

export async function handleWebInstaller(req) {
  try {
    // 1. Generate Secrets
    const sessionSecret = randomBytes(32).toString('hex');
    const hmacSecret = randomBytes(32).toString('hex');
    const csrfSecret = randomBytes(32).toString('hex');
    const isDev = config.env === "development";
    
    // 2. Write to appropriate .env file
    const envFileName = isDev ? ".env.development" : ".env.production";
    const envPath = join(process.cwd(), "config", envFileName);
    
    const envContent = `SESSION_SECRET=${sessionSecret}
HMAC_SECRET=${hmacSecret}
CSRF_SECRET=${csrfSecret}
`;

    // Only configure files inside the "config" directory or standard env naming logic
    // Actually, Bun auto-loads .env.production from process.cwd() or similar. 
    // We will save it in the root directory to ensure Bun/Node picks it up on next boot.
    const rootEnvPath = join(process.cwd(), envFileName);
    writeFileSync(rootEnvPath, envContent);

    // 3. Ensure Data directories exist
    const dataDir = join(process.cwd(), "data");
    const uploadsDir = join(dataDir, "uploads");
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });

    // 4. Update config object in-memory so no restart is required for setup
    config.security = config.security || {};
    config.security.sessionSecret = sessionSecret;
    config.security.hmacSecret = hmacSecret;
    config.security.csrfSecret = csrfSecret;
    config.isSetupRequired = false;

    // 5. Redirect straight to the Admin user setup
    return Response.redirect("/admin/setup", 302);
  } catch (error) {
    const errorContent = `
      <h1>Setup Failed</h1>
      <p>Could not write configuration. Check file permissions.</p>
      <div class="logs" style="color:#ef4444">${error.message}</div>
    `;
    return new Response(installerLayout("Error", errorContent), { status: 500, headers: { "Content-Type": "text/html" } });
  }
}
