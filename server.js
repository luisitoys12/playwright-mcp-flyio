const express = require('express');
const { spawn } = require('child_process');
const http = require('http');

const app = express();
const PORT = 8080;
const MCP_PORT = 8931;
const API_TOKEN = process.env.MCP_AUTH_TOKEN || 'e164ec1cc27d2ebf784de4e3482a11224e0040e6ea0c4057d9777e486f65f41e';

// En v0.0.47+ el MCP elimino --allowed-origins como flag de servidor.
// Solucion: arrancar el MCP en 127.0.0.1 Y pasar el origin correcto desde el proxy.
// El MCP acepta conexiones si el header Origin coincide con su propio host:port.
const MCP_ORIGIN = `http://127.0.0.1:${MCP_PORT}`;

const mcp = spawn('npx', [
  '@playwright/mcp@latest',
  '--headless',
  '--port', String(MCP_PORT),
  '--host', '127.0.0.1',
], { stdio: 'inherit' });
mcp.on('error', err => console.error('MCP spawn error:', err));
mcp.on('exit',  code => console.log('MCP exited:', code));

// Auth helper (Bearer / ?token= / /path/token)
function extractToken(req) {
  return (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim()
    || req.query.token
    || req.params.token
    || '';
}
function auth(req, res, next) {
  if (extractToken(req) === API_TOKEN) return next();
  res.status(401).json({ error: 'Unauthorized.' });
}

// Proxy: reescribe host y origin para que el MCP acepte la conexion
function proxyTo(targetPath) {
  return (req, res) => {
    const { token, ...rest } = req.query;
    const qs = new URLSearchParams(rest).toString();
    const path = targetPath + (qs ? '?' + qs : '');

    // Construir headers limpios — sin authorization, con origin correcto
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (k === 'authorization') continue;
      headers[k] = v;
    }
    headers['host']   = `127.0.0.1:${MCP_PORT}`;
    headers['origin'] = MCP_ORIGIN;

    const opts = {
      hostname : '127.0.0.1',
      port     : MCP_PORT,
      path,
      method   : req.method,
      headers,
    };

    const proxy = http.request(opts, mcpRes => {
      res.writeHead(mcpRes.statusCode, mcpRes.headers);
      mcpRes.pipe(res);
    });
    proxy.on('error', err => {
      console.error('Proxy error:', err.message);
      if (!res.headersSent)
        res.status(502).json({ error: 'MCP not ready, retry in a few seconds.' });
    });
    req.pipe(proxy, { end: true });
  };
}

// Streamable HTTP moderno — Claude Desktop, Cursor, Copilot, n8n
app.all('/mcp/:token', auth, proxyTo('/mcp'));
app.all('/mcp',        auth, proxyTo('/mcp'));

// SSE legacy — Perplexity Pro y otros LLMs
app.all('/sse/:token', auth, proxyTo('/sse'));
app.all('/sse',        auth, proxyTo('/sse'));

// Canal de mensajes del protocolo SSE
app.all('/message/:token', auth, proxyTo('/message'));
app.all('/message',        auth, proxyTo('/message'));

// Pagina de estado
app.get('/', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Playwright MCP Server</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f1117;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#1a1d2e;border:1px solid #2d3148;border-radius:16px;padding:40px;max-width:700px;width:100%}
    .badge{display:inline-flex;align-items:center;gap:8px;background:#22c55e22;color:#22c55e;border:1px solid #22c55e44;border-radius:999px;padding:4px 14px;font-size:13px;margin-bottom:24px}
    .dot{width:8px;height:8px;background:#22c55e;border-radius:50%;animation:pulse 1.5s infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    h1{font-size:26px;font-weight:700;margin-bottom:8px}h1 span{color:#818cf8}
    .sub{color:#94a3b8;margin-bottom:28px;line-height:1.6;font-size:14px}
    .section{margin-bottom:22px}
    .section h2{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-bottom:10px}
    .endpoint{background:#0f1117;border:1px solid #2d3148;border-radius:8px;padding:11px 14px;font-family:monospace;font-size:12px;color:#a5b4fc;word-break:break-all;margin-bottom:6px}
    .ep-label{font-size:11px;color:#475569;margin-bottom:3px}
    .tag{display:inline-block;background:#818cf822;color:#818cf8;border:1px solid #818cf833;border-radius:4px;padding:1px 7px;font-size:10px;margin-left:6px;vertical-align:middle}
    .tag.green{background:#22c55e22;color:#22c55e;border-color:#22c55e33}
    .tools{display:flex;flex-wrap:wrap;gap:6px}
    .tool{background:#1e2235;border:1px solid #2d3148;border-radius:5px;padding:3px 9px;font-size:12px;color:#94a3b8}
    .auth-note{background:#818cf811;border:1px solid #818cf833;border-radius:8px;padding:14px;font-size:13px;color:#a5b4fc;margin-top:8px;line-height:1.9}
    .auth-note code{background:#0f1117;padding:2px 6px;border-radius:4px;font-size:11px}
    footer{margin-top:24px;font-size:12px;color:#475569;text-align:center}
    footer a{color:#818cf8;text-decoration:none}
  </style>
</head>
<body><div class="card">
  <div class="badge"><span class="dot"></span> Servidor activo &mdash; Dallas (dfw)</div>
  <h1>&#127917; Playwright <span>MCP Server</span></h1>
  <p class="sub">Automatizaci&#243;n remota de navegador Chromium headless v&#237;a MCP.<br>Compatible con Perplexity Pro, Claude, n8n, Composio, Cursor y GitHub Copilot.</p>
  <div class="section">
    <h2>&#9889; Streamable HTTP <span class="tag green">MODERNO</span> &mdash; /mcp</h2>
    <div class="ep-label">Token en path</div>
    <div class="endpoint">https://playwright-mcp-kus.fly.dev/mcp/TOKEN</div>
    <div class="ep-label">Bearer header</div>
    <div class="endpoint">https://playwright-mcp-kus.fly.dev/mcp</div>
  </div>
  <div class="section">
    <h2>&#128268; SSE Legacy <span class="tag">LEGACY</span> &mdash; /sse</h2>
    <div class="ep-label">Token en path (Perplexity Pro)</div>
    <div class="endpoint">https://playwright-mcp-kus.fly.dev/sse/TOKEN</div>
    <div class="ep-label">Query param</div>
    <div class="endpoint">https://playwright-mcp-kus.fly.dev/sse?token=TOKEN</div>
  </div>
  <div class="section"><h2>&#128295; Herramientas</h2><div class="tools">
    <span class="tool">browser_navigate</span><span class="tool">browser_click</span>
    <span class="tool">browser_fill</span><span class="tool">browser_screenshot</span>
    <span class="tool">browser_get_text</span><span class="tool">browser_evaluate</span>
    <span class="tool">browser_wait_for</span><span class="tool">browser_scroll</span>
    <span class="tool">browser_hover</span><span class="tool">browser_select</span>
    <span class="tool">browser_snapshot</span><span class="tool">browser_close</span>
  </div></div>
  <div class="auth-note">&#128274; <strong>3 formas de autenticar:</strong><br>
    <strong>1. Path:</strong> <code>/mcp/TOKEN</code> o <code>/sse/TOKEN</code><br>
    <strong>2. Query:</strong> <code>?token=TOKEN</code><br>
    <strong>3. Header:</strong> <code>Authorization: Bearer TOKEN</code>
  </div>
  <footer><a href="https://github.com/luisitoys12/playwright-mcp-flyio" target="_blank">Ver en GitHub</a> &bull; EstacionKUS Medios &copy; 2026</footer>
</div></body></html>`);
});

app.listen(PORT, '0.0.0.0', () =>
  console.log(`Servidor en 0.0.0.0:${PORT} | MCP interno en :${MCP_PORT} | origin esperado: ${MCP_ORIGIN}`)
);
