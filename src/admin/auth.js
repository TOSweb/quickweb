// src/admin/auth.js — Donezo Styled Login & Setup
import { login, logout, createFirstAdmin, getTokenFromRequest, getSession } from "../core/auth.js";
import { getSetting } from "../db.js";
import { checkRateLimit, recordLoginSuccess, getClientIp } from "../core/ratelimit.js";

function authLayout(title, content) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} — Veave CMS</title>
    ${getSetting('favicon') ? `<link rel="icon" href="${getSetting('favicon')}">` : ''}
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
            max-width: 440px;
            text-align: center;
        }
        .brand { font-size: 28px; font-weight: 700; margin-bottom: 40px; color: var(--primary); display: flex; align-items: center; justify-content: center; gap: 10px; }
        .brand span.text-icon { background: var(--primary); color: white; padding: 0 10px; border-radius: 8px; }
        .brand img { max-width: 100%; height: 36px; object-fit: contain; }
        
        h1 { font-size: 24px; margin-bottom: 30px; font-weight: 700; }
        
        input { 
            width: 100%; padding: 16px 24px; margin-bottom: 20px; 
            border: 2px solid #f1f5f9; border-radius: 20px; 
            background: #f1f5f9; font-family: inherit; font-size: 16px;
            transition: 0.2s;
        }
        input:focus { border-color: var(--primary); background: white; outline: none; }
        
        button { 
            width: 100%; padding: 16px; background: var(--primary); color: white; 
            border: none; border-radius: 20px; font-weight: 700; font-size: 16px;
            cursor: pointer; transition: 0.3s; margin-top: 10px;
        }
        button:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(21, 77, 55, 0.2); }
        
        .footer-link { margin-top: 30px; font-size: 14px; color: #64748b; }
    </style>
</head>
<body>
    <div class="auth-card">
        <div class="brand">
            ${getSetting('site_logo') 
                ? `<img src="${getSetting('site_logo')}" alt="Veave CMS">` 
                : `<span class="text-icon">V</span> Veave CMS`
            }
        </div>
        ${content}
    </div>
</body>
</html>`;
}

export async function loginPage(req) {
  const content = `
    <h1>Sign In</h1>
    <form method="POST">
        <input type="text" name="username" placeholder="Username" required autofocus>
        <input type="password" name="password" placeholder="Password" required>
        <button type="submit">Access Dashboard</button>
    </form>
    <div class="footer-link">Protected by HMAC & CSRF v2.0</div>
  `;
  return new Response(authLayout("Login", content), { headers: { "Content-Type": "text/html" } });
}

export async function handleLogin(req) {
  const ip = getClientIp(req);
  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    return new Response(authLayout("Locked", `<h1>Too Many Attempts</h1><p>${rate.reason}</p><a href="/admin/login">Try Again</a>`), { status: 429, headers: { "Content-Type": "text/html" } });
  }

  const form = req._form;
  const token = await login(form.get("username"), form.get("password"));
  if (token) {
    recordLoginSuccess(ip);
    return new Response("OK", {
      status: 302,
      headers: {
        "Location": "/admin",
        "Set-Cookie": `cms_token=${token}; Path=/; HttpOnly; SameSite=Lax`
      }
    });
  }
  return new Response(authLayout("Error", `<h1>Access Denied</h1><p>Invalid credentials.</p><a href="/admin/login">Try Again</a>`), { status: 401, headers: { "Content-Type": "text/html" } });
}

export async function setupPage(req) {
  const content = `
    <h1>System Setup</h1>
    <p style="margin-bottom:30px; color:#64748b">Create your master administrator account to get started.</p>
    <form method="POST">
        <input type="text" name="username" placeholder="Admin Username" required>
        <input type="password" name="password" placeholder="Admin Password" required>
        <button type="submit">Initialize System</button>
    </form>
  `;
  return new Response(authLayout("Setup", content), { headers: { "Content-Type": "text/html" } });
}

export async function handleSetup(req) {
  const form = req._form;
  const success = await createFirstAdmin(form.get("username"), form.get("password"));
  if (success) return Response.redirect("/admin/login", 302);
  return new Response(authLayout("Error", `<h1>Setup Blocked</h1><p>System already initialized.</p><a href="/admin/login">Go to Login</a>`), { status: 400, headers: { "Content-Type": "text/html" } });
}

export async function handleLogout(req) {
  const token = getTokenFromRequest(req);
  await logout(token);
  return new Response("Logged out", {
    status: 302,
    headers: {
      "Location": "/admin/login",
      "Set-Cookie": "cms_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT"
    }
  });
}
