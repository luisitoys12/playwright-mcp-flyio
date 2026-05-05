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
mcp.on('error', err => console.error('MCP error:', err));
mcp.on('exit', code => console.log('MCP exited:', code));

// Auth: Bearer header / ?token= / token en path
function extractToken(req) {
  return (req.headers['authorization'] || '').replace('Bearer ', '').trim()
    || req.query.token || req.params.token || '';
}
function auth(req, res, next) {
  if (extractToken(req) === API_TOKEN) return next();
  res.status(401).json({ error: 'Unauthorized.' });
}

// Proxy generico hacia MCP
function makeProxy(targetPath) {
  return (req, res) => {
    const { token, ...clean } = req.query;
    const qs = new URLSearchParams(clean).toString();
    const path = targetPath + (qs ? '?' + qs : '');
    const opts = {
      hostname: '127.0.0.1', port: MCP_PORT,
      path, method: req.method,
      headers: { ...req.headers, host: 'localhost', origin: 'http://localhost' },
    };
    delete opts.headers['authorization'];
    const pr = http.request(opts, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    pr.on('error', () => { if (!res.headersSent) res.status(502).json({ error: 'MCP not ready, retry in seconds.' }); });
    req.pipe(pr, { end: true });
  };
}

// Rutas SSE y message (3 formas de auth)
app.use('/sse/:token',     auth, makeProxy('/sse'));
app.use('/sse',            auth, makeProxy('/sse'));
app.use('/message/:token', auth, makeProxy('/message'));
app.use('/message',        auth, makeProxy('/message'));

// Pagina publica
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Playwright MCP Server</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f1117;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#1a1d2e;border:1px solid #2d3148;border-radius:16px;padding:40px;max-width:660px;width:100%}
    .badge{display:inline-flex;align-items:center;gap:8px;background:#22c55e22;color:#22c55e;border:1px solid #22c55e44;border-radius:999px;padding:4px 14px;font-size:13px;margin-bottom:24px}
    .dot{width:8px;height:8px;background:#22c55e;border-radius:50%;animation:pulse 1.5s infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    h1{font-size:26px;font-weight:700;margin-bottom:8px}h1 span{color:#818cf8}
    .sub{color:#94a3b8;margin-bottom:28px;line-height:1.6;font-size:14px}
    .section{margin-bottom:20px}
    .section h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-bottom:10px}
    .endpoint{background:#0f1117;border:1px solid #2d3148;border-radius:8px;padding:11px 14px;font-family:monospace;font-size:12px;color:#a5b4fc;word-break:break-all;margin-bottom:6px}
    .ep-label{font-size:11px;color:#475569;margin-bottom:3px}
    .tools{display:flex;flex-wrap:wrap;gap:6px}
    .tool{background:#1e2235;border:1px solid #2d3148;border-radius:5px;padding:3px 9px;font-size:12px;color:#94a3b8}
    .auth-note{background:#818cf811;border:1px solid #818cf833;border-radius:8px;padding:14px;font-size:13px;color:#a5b4fc;margin-top:8px;line-height:1.8}
    .auth-note code{background:#0f1117;padding:2px 6px;border-radius:4px;font-size:11px}
    footer{margin-top:24px;font-size:12px;color:#475569;text-align:center}
    footer a{color:#818cf8;text-decoration:none}
  </style>
</head>
<body><div class="card">
  <div class="badge"><span class="dot"></span> Servidor activo</div>
  <h1>&#127917; Playwright <span>MCP Server</span></h1>
  <p class="sub">Automatizaci&#243;n remota de navegador Chromium headless v&#237;a MCP. Navega, extrae datos, llena formularios y toma screenshots desde cualquier agente IA.</p>

  <div class="section">
    <h2>Endpoints SSE</h2>
    <div class="ep-label">Perplexity Pro (token en path)</div>
    <div class="endpoint">https://playwright-mcp-kus.fly.dev/sse/TOKEN</div>
    <div class="ep-label">Bearer header / curl</div>
    <div class="endpoint">https://playwright-mcp-kus.fly.dev/sse</div>
    <div class="ep-label">Query param</div>
    <div class="endpoint">https://playwright-mcp-kus.fly.dev/sse?token=TOKEN</div>
  </div>

  <div class="section"><h2>Herramientas MCP</h2><div class="tools">
    <span class="tool">browser_navigate</span><span class="tool">browser_click</span>
    <span class="tool">browser_fill</span><span class="tool">browser_screenshot</span>
    <span class="tool">browser_get_text</span><span class="tool">browser_evaluate</span>
    <span class="tool">browser_wait_for</span><span class="tool">browser_scroll</span>
    <span class="tool">browser_hover</span><span class="tool">browser_select</span>
  </div></div>

  <div class="section"><h2>Clientes compatibles</h2><div class="tools">
    <span class="tool">&#10003; Perplexity Pro</span>
    <span class="tool">&#10003; Claude Desktop</span>
    <span class="tool">&#10003; Composio</span>
    <span class="tool">&#10003; n8n</span>
    <span class="tool">&#10003; Cursor</span>
    <span class="tool">&#10003; GitHub Copilot</span>
  </div></div>

  <div class="auth-note">&#128274; <strong>3 formas de autenticar:</strong><br>
    <strong>1. Path:</strong> <code>/sse/TU_TOKEN</code> &#8592; Perplexity Pro<br>
    <strong>2. Query:</strong> <code>?token=TU_TOKEN</code> &#8592; curl / n8n<br>
    <strong>3. Header:</strong> <code>Authorization: Bearer TU_TOKEN</code> &#8592; Composio / Claude
  </div>

  <footer>Fly.io &mdash; Dallas (dfw) &bull;
    <a href="https://github.com/luisitoys12/playwright-mcp-flyio" target="_blank">Ver en GitHub</a>
  </footer>
</div></body></html>`);
});

app.listen(PORT, '0.0.0.0', () => console.log(`Servidor en 0.0.0.0:${PORT} | MCP en :${MCP_PORT}`));
