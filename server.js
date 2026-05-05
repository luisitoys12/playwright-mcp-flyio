const express = require('express');
const { spawn } = require('child_process');
const http = require('http');

const app = express();
const PORT = 8080;
const MCP_PORT = 8931;   // @playwright/mcp  (SSE)
const CLI_PORT = 8932;   // @playwright/cli  (SSE)
const API_TOKEN = process.env.MCP_AUTH_TOKEN || 'e164ec1cc27d2ebf784de4e3482a11224e0040e6ea0c4057d9777e486f65f41e';

// ── Arrancar @playwright/mcp ────────────────────────────────────────────────
const mcp = spawn('npx', [
  '@playwright/mcp@latest',
  '--headless',
  '--port', String(MCP_PORT),
  '--host', '127.0.0.1',
  '--allowed-hosts', '*'
], { stdio: 'inherit' });
mcp.on('error', err => console.error('MCP error:', err));
mcp.on('exit', code => console.log('MCP exited:', code));

// ── Arrancar @playwright/cli ────────────────────────────────────────────────
const cli = spawn('playwright-cli', [
  'server',
  '--port', String(CLI_PORT),
  '--host', '127.0.0.1',
], { stdio: 'inherit' });
cli.on('error', err => {
  // Si playwright-cli no tiene subcomando server intentar con npx
  console.error('CLI error (intentando npx):', err.message);
  spawn('npx', ['@playwright/cli@latest', 'server',
    '--port', String(CLI_PORT), '--host', '127.0.0.1'], { stdio: 'inherit' });
});
cli.on('exit', code => console.log('CLI exited:', code));

console.log('Arrancando Playwright MCP (:8931) y CLI (:8932)...');

// ── Auth ────────────────────────────────────────────────────────────────────
function extractToken(req) {
  return (req.headers['authorization'] || '').replace('Bearer ', '').trim()
    || req.query.token || req.params.token || '';
}
function auth(req, res, next) {
  if (extractToken(req) === API_TOKEN) return next();
  res.status(401).json({ error: 'Unauthorized.' });
}

// ── Proxy generico ──────────────────────────────────────────────────────────
function makeProxy(targetPort, targetPath) {
  return (req, res) => {
    const { token, ...clean } = req.query;
    const qs = new URLSearchParams(clean).toString();
    const path = targetPath + (qs ? '?' + qs : '');
    const opts = {
      hostname: '127.0.0.1', port: targetPort,
      path, method: req.method,
      headers: { ...req.headers, host: 'localhost', origin: 'http://localhost' },
    };
    delete opts.headers['authorization'];
    const pr = http.request(opts, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    pr.on('error', err => { if (!res.headersSent) res.status(502).json({ error: 'Service not ready, retry.' }); });
    req.pipe(pr, { end: true });
  };
}

// ── Rutas MCP (/sse y /message) ─────────────────────────────────────────────
app.use('/sse/:token',     auth, makeProxy(MCP_PORT, '/sse'));
app.use('/sse',            auth, makeProxy(MCP_PORT, '/sse'));
app.use('/message/:token', auth, makeProxy(MCP_PORT, '/message'));
app.use('/message',        auth, makeProxy(MCP_PORT, '/message'));

// ── Rutas CLI (/cli/sse y /cli/message) ─────────────────────────────────────
app.use('/cli/sse/:token',     auth, makeProxy(CLI_PORT, '/sse'));
app.use('/cli/sse',            auth, makeProxy(CLI_PORT, '/sse'));
app.use('/cli/message/:token', auth, makeProxy(CLI_PORT, '/message'));
app.use('/cli/message',        auth, makeProxy(CLI_PORT, '/message'));

// ── Pagina de bienvenida ─────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Playwright MCP + CLI Server</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f1117;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#1a1d2e;border:1px solid #2d3148;border-radius:16px;padding:40px;max-width:700px;width:100%}
    .badge{display:inline-flex;align-items:center;gap:8px;background:#22c55e22;color:#22c55e;border:1px solid #22c55e44;border-radius:999px;padding:4px 14px;font-size:13px;margin-bottom:24px}
    .dot{width:8px;height:8px;background:#22c55e;border-radius:50%;animation:pulse 1.5s infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    h1{font-size:26px;font-weight:700;margin-bottom:8px}h1 span{color:#818cf8}
    .sub{color:#94a3b8;margin-bottom:28px;line-height:1.6;font-size:14px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
    @media(max-width:560px){.grid{grid-template-columns:1fr}}
    .box{background:#0f1117;border:1px solid #2d3148;border-radius:10px;padding:16px}
    .box-title{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px;display:flex;align-items:center;gap:6px}
    .mcp-color{color:#818cf8}.cli-color{color:#34d399}
    .ep{font-family:monospace;font-size:11px;color:#94a3b8;word-break:break-all;line-height:1.8}
    .ep span{color:#a5b4fc}
    .tools{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
    .tool{background:#1e2235;border:1px solid #2d3148;border-radius:5px;padding:3px 8px;font-size:11px;color:#94a3b8}
    .auth-note{background:#818cf811;border:1px solid #818cf833;border-radius:8px;padding:14px;font-size:13px;color:#a5b4fc;margin-top:4px}
    .auth-note code{background:#0f1117;padding:2px 6px;border-radius:4px;font-size:11px}
    footer{margin-top:24px;font-size:12px;color:#475569;text-align:center}
    footer a{color:#818cf8;text-decoration:none}
  </style>
</head>
<body><div class="card">
  <div class="badge"><span class="dot"></span> 2 servicios activos</div>
  <h1>&#127917; Playwright <span>MCP + CLI</span></h1>
  <p class="sub">Automatizaci&#243;n remota de navegador Chromium headless. Dos modos: MCP cl&#225;sico para agentes, CLI eficiente en tokens para coding agents (Claude Code, GitHub Copilot).</p>

  <div class="grid">
    <div class="box">
      <div class="box-title"><span class="mcp-color">&#9679;</span> <span class="mcp-color">@playwright/mcp</span></div>
      <div class="ep">
        <div>SSE: <span>/sse/TOKEN</span></div>
        <div>Msg: <span>/message/TOKEN</span></div>
      </div>
      <div class="tools">
        <span class="tool">browser_navigate</span>
        <span class="tool">browser_click</span>
        <span class="tool">browser_fill</span>
        <span class="tool">browser_screenshot</span>
        <span class="tool">browser_get_text</span>
        <span class="tool">browser_evaluate</span>
      </div>
    </div>
    <div class="box">
      <div class="box-title"><span class="cli-color">&#9679;</span> <span class="cli-color">@playwright/cli</span></div>
      <div class="ep">
        <div>SSE: <span>/cli/sse/TOKEN</span></div>
        <div>Msg: <span>/cli/message/TOKEN</span></div>
      </div>
      <div class="tools">
        <span class="tool">test runner</span>
        <span class="tool">skill workflows</span>
        <span class="tool">auto-waiting</span>
        <span class="tool">tracing</span>
        <span class="tool">parallelism</span>
        <span class="tool">token-efficient</span>
      </div>
    </div>
  </div>

  <div class="auth-note">&#128274; <strong>3 formas de auth (ambos endpoints):</strong><br><br>
    <strong>1. Path:</strong> <code>/sse/TU_TOKEN</code> &#8592; recomendado para Perplexity<br>
    <strong>2. Query:</strong> <code>?token=TU_TOKEN</code> &#8592; para curl / n8n<br>
    <strong>3. Header:</strong> <code>Authorization: Bearer TU_TOKEN</code> &#8592; para Composio / Claude
  </div>

  <footer>Fly.io &mdash; Dallas (dfw) &bull; <a href="https://github.com/luisitoys12/playwright-mcp-flyio" target="_blank">GitHub</a></footer>
</div></body></html>`);
});

app.listen(PORT, '0.0.0.0', () => console.log(`Servidor en 0.0.0.0:${PORT} | MCP:${MCP_PORT} CLI:${CLI_PORT}`));
