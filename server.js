const express = require('express');
const { spawn } = require('child_process');
const http     = require('http');
const crypto   = require('crypto');

const PORT     = 8080;
const MCP_PORT = 8931;

// Si no hay token en env, genera uno aleatorio de 32 bytes (64 hex chars)
// y lo muestra en los logs al arrancar → úsalo para conectar tu MCP client
const API_TOKEN = process.env.MCP_AUTH_TOKEN || crypto.randomBytes(32).toString('hex');

// Detectar host público (Fly.io inyecta FLY_APP_NAME)
const APP_HOST = process.env.FLY_APP_NAME
  ? `https://${process.env.FLY_APP_NAME}.fly.dev`
  : `http://localhost:${PORT}`;

// ─── Mostrar URLs de conexión al iniciar ─────────────────────────────────────
function printConnectionInfo() {
  const border = '═'.repeat(60);
  console.log('\n' + border);
  console.log('🎭  PLAYWRIGHT MCP SERVER — LISTO');
  console.log(border);
  if (!process.env.MCP_AUTH_TOKEN) {
    console.log('⚠️  MCP_AUTH_TOKEN no configurado → token generado automáticamente');
    console.log('   (cada reinicio genera un token nuevo)');
    console.log('   Para token fijo: fly secrets set MCP_AUTH_TOKEN=<tu-token>');
    console.log('');
  }
  console.log('🔑  TOKEN:', API_TOKEN);
  console.log('');
  console.log('📡  URLs de conexión:');
  console.log(`   SSE (legacy):        ${APP_HOST}/sse?token=${API_TOKEN}`);
  console.log(`   SSE (en path):       ${APP_HOST}/sse/${API_TOKEN}`);
  console.log(`   Streamable HTTP:     ${APP_HOST}/mcp?token=${API_TOKEN}`);
  console.log('');
  console.log('🛠️  Configuración en tu MCP client:');
  console.log('   URL:    ' + APP_HOST + '/sse/' + API_TOKEN);
  console.log('   ó bien con Header:');
  console.log('   URL:    ' + APP_HOST + '/sse');
  console.log('   Header: Authorization: Bearer ' + API_TOKEN);
  console.log(border + '\n');
}

// ─── Spawn MCP interno ────────────────────────────────────────────────────────
const mcp = spawn('npx', [
  '@playwright/mcp@latest',
  '--headless',
  '--port', String(MCP_PORT),
  '--host', 'localhost',
], { stdio: ['ignore', 'inherit', 'inherit'] });
mcp.on('error', e => console.error('MCP spawn error:', e.message));
mcp.on('exit',  c => console.log('MCP exited with code:', c));

// ─── Auth helper (Bearer / ?token= / /ruta/TOKEN) ─────────────────────────────
function extractToken(req) {
  const bearer = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  if (bearer) return bearer;
  const url = new URL(req.url, 'http://x');
  if (url.searchParams.get('token')) return url.searchParams.get('token');
  const m = req.url.match(/^\/(sse|mcp|message)\/([^/?#]+)/);
  return m ? m[2] : '';
}

// ─── Proxy hacia MCP interno ──────────────────────────────────────────────────
function proxyTo(targetPath) {
  return (req, res) => {
    const url = new URL(req.url, 'http://x');
    url.searchParams.delete('token');
    const cleanPath = targetPath + (url.search || '');

    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (['origin', 'host', 'authorization'].includes(k)) continue;
      headers[k] = v;
    }

    const opts = {
      hostname : 'localhost',
      port     : MCP_PORT,
      path     : cleanPath,
      method   : req.method,
      headers,
    };

    const proxy = http.request(opts, mcpRes => {
      res.writeHead(mcpRes.statusCode, mcpRes.headers);
      mcpRes.pipe(res);
    });
    proxy.on('error', err => {
      console.error('proxy error:', err.message);
      if (!res.headersSent)
        res.status(502).json({ error: 'MCP not ready, retry in seconds.' });
    });
    req.pipe(proxy, { end: true });
  };
}

// ─── Express app ──────────────────────────────────────────────────────────────
const app = express();

function auth(req, res, next) {
  if (extractToken(req) === API_TOKEN) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// Streamable HTTP moderno
app.all('/mcp/:token', auth, proxyTo('/mcp'));
app.all('/mcp',        auth, proxyTo('/mcp'));

// SSE legacy (Claude Desktop, n8n, Perplexity Pro, Cursor)
app.all('/sse/:token', auth, proxyTo('/sse'));
app.all('/sse',        auth, proxyTo('/sse'));

// Canal mensajes SSE
app.all('/message/:token', auth, proxyTo('/message'));
app.all('/message',        auth, proxyTo('/message'));

// ─── Página de estado (muestra las URLs con el token) ─────────────────────────
app.get('/', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Playwright MCP</title>
<style>
  body { font-family: monospace; background: #0d1117; color: #c9d1d9; padding: 2rem; }
  h1 { color: #58a6ff; }
  .box { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 1.5rem; margin: 1rem 0; }
  .url { color: #56d364; word-break: break-all; }
  .label { color: #8b949e; font-size: 0.85rem; }
  .warn { color: #d29922; }
  code { background: #21262d; padding: 2px 6px; border-radius: 4px; }
</style>
</head>
<body>
<h1>🎭 Playwright MCP Server</h1>
${!process.env.MCP_AUTH_TOKEN ? '<p class="warn">⚠️ Token generado automáticamente (se renueva en cada reinicio). Configura <code>MCP_AUTH_TOKEN</code> para token fijo.</p>' : '<p>✅ Token fijo configurado via variable de entorno.</p>'}
<div class="box">
  <p class="label">SSE — Claude Desktop / n8n / Cursor</p>
  <p class="url">${APP_HOST}/sse/${API_TOKEN}</p>
</div>
<div class="box">
  <p class="label">Streamable HTTP — Clientes modernos MCP</p>
  <p class="url">${APP_HOST}/mcp?token=${API_TOKEN}</p>
</div>
<div class="box">
  <p class="label">Token actual</p>
  <code>${API_TOKEN}</code>
</div>
<p class="label">Health: <a href="/health" style="color:#58a6ff">/health</a></p>
</body></html>`);
});

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', app: APP_HOST }));

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  printConnectionInfo();
});
