const express = require('express');
const { spawn } = require('child_process');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = 8080;
const MCP_PORT = 8931;
const API_TOKEN = process.env.MCP_AUTH_TOKEN || 'e164ec1cc27d2ebf784de4e3482a11224e0040e6ea0c4057d9777e486f65f41e';

// Arrancar MCP internamente en 127.0.0.1 con --allowed-hosts *
const mcp = spawn('npx', [
  '@playwright/mcp@latest',
  '--headless',
  '--port', String(MCP_PORT),
  '--host', '127.0.0.1',
  '--allowed-hosts', '*'
], { stdio: 'inherit' });

mcp.on('error', (err) => console.error('MCP error:', err));
mcp.on('exit', (code) => console.log('MCP exited:', code));

// Dar 4 segundos a que MCP arranque antes de aceptar conexiones
let mcpReady = false;
setTimeout(() => { mcpReady = true; console.log('MCP listo'); }, 4000);

// Auth middleware
function auth(req, res, next) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim()
    || (req.query.token || '');
  if (token === API_TOKEN) return next();
  res.status(401).json({ error: 'Unauthorized. Bearer token requerido.' });
}

// Waiting middleware - si MCP no arrancó aún
function ready(req, res, next) {
  if (mcpReady) return next();
  res.status(503).json({ error: 'Server warming up, retry in a few seconds.' });
}

// Proxy hacia MCP - forzar Host a localhost para pasar su validación interna
const proxy = createProxyMiddleware({
  target: `http://127.0.0.1:${MCP_PORT}`,
  changeOrigin: false,
  ws: true,
  on: {
    proxyReq: (proxyReq) => {
      proxyReq.setHeader('Host', 'localhost');
      proxyReq.setHeader('Origin', 'http://localhost');
    },
    error: (err, req, res) => {
      console.error('Proxy error:', err.message);
      if (!res.headersSent) res.status(502).json({ error: 'MCP not available yet, retry.' });
    }
  }
});

app.use('/sse', auth, ready, proxy);
app.use('/message', auth, ready, proxy);

// Página pública de bienvenida
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Playwright MCP Server</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f1117;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center}
    .card{background:#1a1d2e;border:1px solid #2d3148;border-radius:16px;padding:48px;max-width:640px;width:90%}
    .badge{display:inline-flex;align-items:center;gap:8px;background:#22c55e22;color:#22c55e;border:1px solid #22c55e44;border-radius:999px;padding:4px 14px;font-size:13px;margin-bottom:24px}
    .dot{width:8px;height:8px;background:#22c55e;border-radius:50%;animation:pulse 1.5s infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    h1{font-size:28px;font-weight:700;margin-bottom:8px}
    h1 span{color:#818cf8}
    .sub{color:#94a3b8;margin-bottom:32px;line-height:1.6}
    .section{margin-bottom:24px}
    .section h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-bottom:10px}
    .endpoint{background:#0f1117;border:1px solid #2d3148;border-radius:8px;padding:12px 16px;font-family:monospace;font-size:14px;color:#a5b4fc;word-break:break-all}
    .tools{display:flex;flex-wrap:wrap;gap:8px}
    .tool{background:#1e2235;border:1px solid #2d3148;border-radius:6px;padding:4px 10px;font-size:12px;color:#94a3b8}
    .auth-note{background:#f59e0b11;border:1px solid #f59e0b33;border-radius:8px;padding:12px 16px;font-size:13px;color:#fbbf24;margin-top:24px}
    footer{margin-top:32px;font-size:12px;color:#475569;text-align:center}
    footer a{color:#818cf8;text-decoration:none}
  </style>
</head>
<body>
  <div class="card">
    <div class="badge"><span class="dot"></span> Servidor activo</div>
    <h1>&#127917; Playwright <span>MCP Server</span></h1>
    <p class="sub">Servidor MCP remoto con automatizaci&#243;n real de navegador (Chromium headless). Permite a agentes de IA navegar, extraer datos, llenar formularios y tomar screenshots.</p>
    <div class="section">
      <h2>Endpoint SSE</h2>
      <div class="endpoint">https://playwright-mcp-kus.fly.dev/sse</div>
    </div>
    <div class="section">
      <h2>Herramientas disponibles</h2>
      <div class="tools">
        <span class="tool">browser_navigate</span>
        <span class="tool">browser_click</span>
        <span class="tool">browser_fill</span>
        <span class="tool">browser_screenshot</span>
        <span class="tool">browser_get_text</span>
        <span class="tool">browser_evaluate</span>
        <span class="tool">browser_wait_for</span>
        <span class="tool">browser_select</span>
        <span class="tool">browser_hover</span>
        <span class="tool">browser_scroll</span>
      </div>
    </div>
    <div class="section">
      <h2>Clientes compatibles</h2>
      <div class="tools">
        <span class="tool">&#10003; Perplexity Pro</span>
        <span class="tool">&#10003; Claude Desktop</span>
        <span class="tool">&#10003; Composio</span>
        <span class="tool">&#10003; n8n</span>
        <span class="tool">&#10003; Cursor</span>
      </div>
    </div>
    <div class="auth-note">&#128274; <strong>Autenticaci&#243;n requerida.</strong> Header: <code>Authorization: Bearer &lt;token&gt;</code><br>O query param: <code>?token=&lt;tu-token&gt;</code></div>
    <footer>Desplegado en Fly.io &mdash; Dallas (dfw) &bull; <a href="https://github.com/luisitoys12/playwright-mcp-flyio" target="_blank">Ver en GitHub</a></footer>
  </div>
</body>
</html>`);
});

app.listen(PORT, '0.0.0.0', () => console.log(`Proxy corriendo en 0.0.0.0:${PORT}`));
