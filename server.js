const express = require('express');
const { spawn } = require('child_process');
const http  = require('http');

const PORT      = 8080;
const MCP_PORT  = 8931;

// Token leido desde variable de entorno — NUNCA hardcodear en código
const API_TOKEN = process.env.MCP_AUTH_TOKEN;
if (!API_TOKEN) {
  console.error('ERROR: MCP_AUTH_TOKEN env var no definida. Deteniéndose.');
  process.exit(1);
}

// Arrancar proceso MCP interno en headless
const mcp = spawn('npx', [
  '@playwright/mcp@latest',
  '--headless',
  '--port', String(MCP_PORT),
  '--host', 'localhost',
], { stdio: ['ignore', 'inherit', 'inherit'] });
mcp.on('error', e => console.error('MCP error:', e.message));
mcp.on('exit',  c => console.log('MCP exit:', c));

// Auth helper (Bearer / ?token= / /ruta/TOKEN)
function extractToken(req) {
  const bearer = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  if (bearer) return bearer;
  const url = new URL(req.url, 'http://x');
  if (url.searchParams.get('token')) return url.searchParams.get('token');
  const m = req.url.match(/^\/(sse|mcp|message)\/([^/?#]+)/);
  return m ? m[2] : '';
}

// Proxy hacia MCP interno usando 'localhost'
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

const app = express();

function auth(req, res, next) {
  if (extractToken(req) === API_TOKEN) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// Streamable HTTP moderno
app.all('/mcp/:token', auth, proxyTo('/mcp'));
app.all('/mcp',        auth, proxyTo('/mcp'));

// SSE legacy (Perplexity Pro, Claude, n8n)
app.all('/sse/:token', auth, proxyTo('/sse'));
app.all('/sse',        auth, proxyTo('/sse'));

// Canal mensajes SSE
app.all('/message/:token', auth, proxyTo('/message'));
app.all('/message',        auth, proxyTo('/message'));

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Status
app.get('/', (_req, res) => res.send(
  '\u{1F3AD} Playwright MCP Server - OK\n' +
  'SSE : /sse?token=TOKEN\n' +
  'MCP : /mcp  (Authorization: Bearer TOKEN)\n'
));

app.listen(PORT, '0.0.0.0', () =>
  console.log(`Express :${PORT} | MCP interno en localhost:${MCP_PORT}`)
);
