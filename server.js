const express = require('express');
const { spawn } = require('child_process');
const http  = require('http');

const PORT      = 8080;
const MCP_PORT  = 8931;
const API_TOKEN = process.env.MCP_AUTH_TOKEN ||
  'e164ec1cc27d2ebf784de4e3482a11224e0040e6ea0c4057d9777e486f65f41e';

// ── 1. Arrancar el MCP como proceso hijo ──────────────────────────────────────
const mcp = spawn('npx', [
  '@playwright/mcp@latest',
  '--headless',
  '--port', String(MCP_PORT),
  '--host', '127.0.0.1',
], { stdio: ['ignore', 'inherit', 'inherit'] });
mcp.on('error', e  => console.error('MCP error:', e.message));
mcp.on('exit',  c  => console.log ('MCP exit:',  c));

// ── 2. Auth helper ────────────────────────────────────────────────────────────
function extractToken(req) {
  const bearer = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  if (bearer) return bearer;
  const url = new URL(req.url, 'http://x');
  if (url.searchParams.get('token')) return url.searchParams.get('token');
  const m = req.url.match(/^\/(sse|mcp|message)\/([^/?#]+)/);
  return m ? m[2] : '';
}

// ── 3. Proxy: elimina headers que causan el rechazo ───────────────────────────
function proxyTo(targetPath) {
  return (req, res) => {
    // Quitar token del query string
    const url  = new URL(req.url, 'http://x');
    url.searchParams.delete('token');
    // Normalizar path (/sse/TOKEN → /sse)
    const cleanPath = targetPath + (url.search || '');

    // Copiar headers SIN origin, SIN host, SIN authorization
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (['origin', 'host', 'authorization'].includes(k)) continue;
      headers[k] = v;
    }
    // El MCP acepta conexiones si NO hay header Origin (o si coincide con su host)
    // Al omitir Origin el MCP no realiza la validacion y deja pasar la peticion.

    const opts = {
      hostname : '127.0.0.1',
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
        res.status(502).json({ error: 'MCP not ready, retry.' });
    });
    req.pipe(proxy, { end: true });
  };
}

// ── 4. Express con auth ───────────────────────────────────────────────────────
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

// Canal de mensajes SSE
app.all('/message/:token', auth, proxyTo('/message'));
app.all('/message',        auth, proxyTo('/message'));

// Status page
app.get('/', (_req, res) => res.send(
  '\u{1F3AD} Playwright MCP Server \u2014 OK\n' +
  'SSE:  /sse?token=TOKEN\n' +
  'MCP:  /mcp  (Authorization: Bearer TOKEN)\n'
));

app.listen(PORT, '0.0.0.0', () =>
  console.log(`Express en :${PORT} | MCP interno en :${MCP_PORT}`)
);
