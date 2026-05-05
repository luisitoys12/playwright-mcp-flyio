// SOLUCION DEFINITIVA
// El MCP valida el header Origin contra su propio host:port.
// Ningun proxy externo puede falsificar eso sin que el MCP lo rechace.
// Solucion: correr el MCP directamente en 0.0.0.0:8080 con auth propia.
// Usamos un wrapper que intercepta ANTES de pasar al MCP via createServer.

const http = require('http');
const { createServer } = require('@playwright/mcp/lib/index.js');

const API_TOKEN = process.env.MCP_AUTH_TOKEN || 'e164ec1cc27d2ebf784de4e3482a11224e0040e6ea0c4057d9777e486f65f41e';
const PORT = 8080;

function extractToken(req) {
  // 1. Bearer header
  const auth = req.headers['authorization'] || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  // 2. ?token=
  const url = new URL(req.url, 'http://localhost');
  if (url.searchParams.get('token')) return url.searchParams.get('token');
  // 3. /sse/TOKEN o /mcp/TOKEN
  const m = req.url.match(/^\/(sse|mcp|message)\/([^/?]+)/);
  if (m) return m[2];
  return '';
}

async function main() {
  // Crear el servidor MCP de Playwright
  const mcpServer = await createServer({
    headless: true,
    port: 0,          // no abre puerto propio
    launchOptions: { executablePath: '/ms-playwright/chromium-1169/chrome-linux/chrome' },
  });

  // Wrapper HTTP que valida auth antes de delegar al MCP
  const server = http.createServer((req, res) => {
    const token = extractToken(req);

    // Pagina publica sin auth
    if (req.url === '/' || req.url === '') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Playwright MCP Server - OK\n/sse /mcp /message disponibles con token.');
      return;
    }

    if (token !== API_TOKEN) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    // Normalizar la URL quitando el token del path
    // /sse/TOKEN -> /sse   /mcp/TOKEN -> /mcp
    req.url = req.url
      .replace(/^\/(sse|mcp|message)\/[^/?]+/, '/$1')
      .replace(/[?&]token=[^&]+/, '')
      .replace(/[?&]$/, '');

    // Fijar origin para que el MCP lo acepte
    req.headers['origin'] = `http://localhost:${PORT}`;
    req.headers['host']   = `localhost:${PORT}`;

    // Delegar al handler interno del MCP
    mcpServer.emit('request', req, res);
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Playwright MCP Server corriendo en 0.0.0.0:${PORT}`);
    console.log(`SSE:  https://playwright-mcp-kus.fly.dev/sse?token=TOKEN`);
    console.log(`MCP:  https://playwright-mcp-kus.fly.dev/mcp   (Bearer TOKEN)`);
  });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
