const express = require('express');
const { spawn } = require('child_process');
const http = require('http');

const app = express();
const PORT = 8080;
const MCP_PORT = 8931;
const API_TOKEN = process.env.MCP_AUTH_TOKEN || 'e164ec1cc27d2ebf784de4e3482a11224e0040e6ea0c4057d9777e486f65f41e';

// Arrancar MCP internamente
const mcp = spawn('npx', [
  '@playwright/mcp@latest',
  '--headless',
  '--port', String(MCP_PORT),
  '--host', '127.0.0.1',
  '--allowed-hosts', '*'
], { stdio: 'inherit' });
mcp.on('error', (err) => console.error('MCP error:', err));
mcp.on('exit', (code) => console.log('MCP exited:', code));

// Validar token desde header, query param, o path param
function extractToken(req) {
  return (req.headers['authorization'] || '').replace('Bearer ', '').trim()
    || req.query.token
    || req.params.token
    || '';
}

function auth(req, res, next) {
  if (extractToken(req) === API_TOKEN) return next();
  res.status(401).json({ error: 'Unauthorized.' });
}

// Proxy SSE generico hacia MCP (limpia token de la URL)
function proxySSE(req, res) {
  const { token, ...cleanQuery } = req.query;
  const qs = new URLSearchParams(cleanQuery).toString();
  const path = '/sse' + (qs ? '?' + qs : '');

  const opts = {
    hostname: '127.0.0.1',
    port: MCP_PORT,
    path,
    method: 'GET',
    headers: { ...req.headers, host: 'localhost', origin: 'http://localhost' },
  };
  delete opts.headers['authorization'];

  const proxyReq = http.request(opts, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
  proxyReq.on('error', (err) => {
    if (!res.headersSent) res.status(502).json({ error: 'MCP not ready, retry.' });
  });
  req.pipe(proxyReq, { end: true });
}

// Proxy /message generico
function proxyMessage(req, res) {
  const { token, ...cleanQuery } = req.query;
  const qs = new URLSearchParams(cleanQuery).toString();
  const path = '/message' + (qs ? '?' + qs : '');

  const opts = {
    hostname: '127.0.0.1',
    port: MCP_PORT,
    path,
    method: req.method,
    headers: { ...req.headers, host: 'localhost', origin: 'http://localhost' },
  };
  delete opts.headers['authorization'];

  const proxyReq = http.request(opts, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
  proxyReq.on('error', () => {
    if (!res.headersSent) res.status(502).json({ error: 'MCP not ready.' });
  });
  req.pipe(proxyReq, { end: true });
}

// RUTAS SSE
// 1. Token en el path  → para Perplexity Pro
app.use('/sse/:token', auth, proxySSE);
// 2. Token en ?token=  → para curl / otros clientes  
app.use('/sse', auth, proxySSE);

// RUTAS MESSAGE
app.use('/message/:token', auth, proxyMessage);
app.use('/message', auth, proxyMessage);

// Pagina publica
app.get('/', (req, res) => {
  const url = `https://playwright-mcp-kus.fly.dev/sse/${API_TOKEN}`;
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Playwright MCP Server</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f1117;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center}
    .card{background:#1a1d2e;border:1px solid #2d3148;border-radius:16px;padding:48px;max-width:660px;width:90%}
    .badge{display:inline-flex;align-items:center;gap:8px;background:#22c55e22;color:#22c55e;border:1px solid #22c55e44;border-radius:999px;padding:4px 14px;font-size:13px;margin-bottom:24px}
    .dot{width:8px;height:8px;background:#22c55e;border-radius:50%;animation:pulse 1.5s infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    h1{font-size:28px;font-weight:700;margin-bottom:8px}h1 span{color:#818cf8}
    .sub{color:#94a3b8;margin-bottom:32px;line-height:1.6}
    .section{margin-bottom:24px}
    .section h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-bottom:10px}
    .endpoint{background:#0f1117;border:1px solid #2d3148;border-radius:8px;padding:12px 16px;font-family:monospace;font-size:12px;color:#a5b4fc;word-break:break-all}
    .label{font-size:11px;color:#64748b;margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em}
    .tools{display:flex;flex-wrap:wrap;gap:8px}
    .tool{background:#1e2235;border:1px solid #2d3148;border-radius:6px;padding:4px 10px;font-size:12px;color:#94a3b8}
    .auth-note{background:#818cf811;border:1px solid #818cf833;border-radius:8px;padding:16px;font-size:13px;color:#a5b4fc;margin-top:24px}
    .auth-note code{background:#0f1117;padding:2px 6px;border-radius:4px;font-size:12px}
    footer{margin-top:32px;font-size:12px;color:#475569;text-align:center}
    footer a{color:#818cf8;text-decoration:none}
  </style>
</head>
<body><div class="card">
  <div class="badge"><span class="dot"></span> Servidor activo</div>
  <h1>&#127917; Playwright <span>MCP Server</span></h1>
  <p class="sub">Servidor MCP remoto con Chromium headless. Navega, extrae datos, llena formularios y toma screenshots desde cualquier agente IA.</p>

  <div class="section">
    <h2>Endpoints</h2>
    <div class="label">Perplexity Pro / path token</div>
    <div class="endpoint">https://playwright-mcp-kus.fly.dev/sse/TOKEN</div>
    <br>
    <div class="label">Bearer header / curl</div>
    <div class="endpoint">https://playwright-mcp-kus.fly.dev/sse</div>
  </div>

  <div class="section"><h2>Herramientas</h2><div class="tools">
    <span class="tool">browser_navigate</span><span class="tool">browser_click</span>
    <span class="tool">browser_fill</span><span class="tool">browser_screenshot</span>
    <span class="tool">browser_get_text</span><span class="tool">browser_evaluate</span>
    <span class="tool">browser_wait_for</span><span class="tool">browser_scroll</span>
  </div></div>

  <div class="section"><h2>Clientes compatibles</h2><div class="tools">
    <span class="tool">&#10003; Perplexity Pro</span><span class="tool">&#10003; Claude Desktop</span>
    <span class="tool">&#10003; Composio</span><span class="tool">&#10003; n8n</span><span class="tool">&#10003; Cursor</span>
  </div></div>

  <div class="auth-note">&#128274; <strong>3 formas de autenticar:</strong><br><br>
    <strong>1. Path (Perplexity):</strong> <code>/sse/TU_TOKEN</code><br>
    <strong>2. Query param:</strong> <code>/sse?token=TU_TOKEN</code><br>
    <strong>3. Header:</strong> <code>Authorization: Bearer TU_TOKEN</code>
  </div>

  <footer>Fly.io &mdash; Dallas (dfw) &bull; <a href="https://github.com/luisitoys12/playwright-mcp-flyio" target="_blank">GitHub</a></footer>
</div></body></html>`);
});

app.listen(PORT, '0.0.0.0', () => console.log(`Proxy en 0.0.0.0:${PORT}`));
