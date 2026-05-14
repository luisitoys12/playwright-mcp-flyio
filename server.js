const express = require('express');
const { spawn } = require('child_process');
const http     = require('http');
const https    = require('https');
const crypto   = require('crypto');

const PORT     = 8080;
const MCP_PORT = 8931;

// ─── Config ───────────────────────────────────────────────────────────────────
const API_TOKEN = process.env.MCP_AUTH_TOKEN || crypto.randomBytes(32).toString('hex');
const APP_HOST  = process.env.FLY_APP_NAME
  ? `https://${process.env.FLY_APP_NAME}.fly.dev`
  : `http://localhost:${PORT}`;

const SPOTIFY_CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID     || '';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';
const SPOTIFY_REDIRECT_URI  = `${APP_HOST}/spotify/callback`;
const SPOTIFY_SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'streaming',
].join(' ');

// ─── Spotify token store (en memoria) ────────────────────────────────────────
let spotifyTokens = {
  access_token  : process.env.SPOTIFY_ACCESS_TOKEN  || null,
  refresh_token : process.env.SPOTIFY_REFRESH_TOKEN || null,
  expires_at    : 0,
};

// ─── Helpers Spotify ──────────────────────────────────────────────────────────
function spotifyRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    grant_type  : 'authorization_code',
    code,
    redirect_uri: SPOTIFY_REDIRECT_URI,
  }).toString();

  const result = await spotifyRequest({
    hostname: 'accounts.spotify.com',
    path    : '/api/token',
    method  : 'POST',
    headers : {
      'Content-Type'  : 'application/x-www-form-urlencoded',
      'Authorization' : 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);

  if (result.status === 200) {
    spotifyTokens.access_token  = result.body.access_token;
    spotifyTokens.refresh_token = result.body.refresh_token;
    spotifyTokens.expires_at    = Date.now() + (result.body.expires_in * 1000);
    console.log('✅ Spotify: tokens guardados correctamente');
  }
  return result;
}

async function refreshAccessToken() {
  if (!spotifyTokens.refresh_token) return false;
  const body = new URLSearchParams({
    grant_type   : 'refresh_token',
    refresh_token: spotifyTokens.refresh_token,
  }).toString();

  const result = await spotifyRequest({
    hostname: 'accounts.spotify.com',
    path    : '/api/token',
    method  : 'POST',
    headers : {
      'Content-Type'  : 'application/x-www-form-urlencoded',
      'Authorization' : 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);

  if (result.status === 200) {
    spotifyTokens.access_token = result.body.access_token;
    spotifyTokens.expires_at   = Date.now() + (result.body.expires_in * 1000);
    if (result.body.refresh_token) spotifyTokens.refresh_token = result.body.refresh_token;
    console.log('🔄 Spotify: access_token renovado');
    return true;
  }
  return false;
}

async function getValidAccessToken() {
  if (!spotifyTokens.access_token) return null;
  if (Date.now() > spotifyTokens.expires_at - 60000) {
    const ok = await refreshAccessToken();
    if (!ok) return null;
  }
  return spotifyTokens.access_token;
}

// ─── Startup info ─────────────────────────────────────────────────────────────
function printConnectionInfo() {
  const b = '═'.repeat(60);
  console.log('\n' + b);
  console.log('🎭  PLAYWRIGHT MCP — LISTO');
  console.log(b);
  if (!process.env.MCP_AUTH_TOKEN) {
    console.log('⚠️  MCP_AUTH_TOKEN no configurado → token generado automáticamente');
    console.log('   Para token fijo: fly secrets set MCP_AUTH_TOKEN=<token>');
  }
  console.log('🔑  MCP TOKEN:', API_TOKEN);
  console.log('');
  console.log('📡  MCP URLs:');
  console.log(`   SSE:  ${APP_HOST}/sse/${API_TOKEN}`);
  console.log(`   HTTP: ${APP_HOST}/mcp?token=${API_TOKEN}`);
  console.log('');
  if (!SPOTIFY_CLIENT_ID) {
    console.log('⚠️  SPOTIFY_CLIENT_ID no configurado');
  } else if (!spotifyTokens.access_token) {
    console.log('🎵  Spotify: NO autenticado');
    console.log(`   → Login: ${APP_HOST}/spotify/login`);
  } else {
    console.log('🎵  Spotify: ✅ sesión activa');
  }
  console.log(b + '\n');
}

// ─── Spawn MCP interno ────────────────────────────────────────────────────────
// La imagen mcr.microsoft.com/playwright guarda los browsers en /ms-playwright
// Forzamos PLAYWRIGHT_BROWSERS_PATH para que npx @playwright/mcp los encuentre
const mcpEnv = {
  ...process.env,
  PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || '/ms-playwright',
  DISPLAY: process.env.DISPLAY || '',
};

const mcp = spawn('npx', [
  '@playwright/mcp@latest',
  '--headless',
  '--port', String(MCP_PORT),
  '--host', 'localhost',
], {
  stdio: ['ignore', 'inherit', 'inherit'],
  env: mcpEnv,
});
mcp.on('error', e => console.error('MCP spawn error:', e.message));
mcp.on('exit',  c => console.log('MCP exited:', c));

// ─── Auth MCP ────────────────────────────────────────────────────────────────
function extractToken(req) {
  const bearer = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  if (bearer) return bearer;
  const url = new URL(req.url, 'http://x');
  if (url.searchParams.get('token')) return url.searchParams.get('token');
  const m = req.url.match(/^\/(sse|mcp|message)\/([^/?#]+)/);
  return m ? m[2] : '';
}

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
    const proxy = http.request(
      { hostname: 'localhost', port: MCP_PORT, path: cleanPath, method: req.method, headers },
      mcpRes => { res.writeHead(mcpRes.statusCode, mcpRes.headers); mcpRes.pipe(res); }
    );
    proxy.on('error', err => {
      console.error('proxy error:', err.message);
      if (!res.headersSent) res.status(502).json({ error: 'MCP not ready, retry in seconds.' });
    });
    req.pipe(proxy, { end: true });
  };
}

// ─── Express ──────────────────────────────────────────────────────────────────
const app = express();

function auth(req, res, next) {
  if (extractToken(req) === API_TOKEN) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// MCP proxy routes
app.all('/mcp/:token', auth, proxyTo('/mcp'));
app.all('/mcp',        auth, proxyTo('/mcp'));
app.all('/sse/:token', auth, proxyTo('/sse'));
app.all('/sse',        auth, proxyTo('/sse'));
app.all('/message/:token', auth, proxyTo('/message'));
app.all('/message',        auth, proxyTo('/message'));

// ─── Spotify OAuth routes ────────────────────────────────────────────────────

app.get('/spotify/login', (req, res) => {
  if (!SPOTIFY_CLIENT_ID) {
    return res.status(500).send('❌ SPOTIFY_CLIENT_ID no configurado. Corre: fly secrets set SPOTIFY_CLIENT_ID=xxx');
  }
  const state = crypto.randomBytes(8).toString('hex');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id    : SPOTIFY_CLIENT_ID,
    scope        : SPOTIFY_SCOPES,
    redirect_uri : SPOTIFY_REDIRECT_URI,
    state,
  });
  const loginUrl = 'https://accounts.spotify.com/authorize?' + params.toString();
  console.log('🎵 Spotify: redirigiendo a login...');
  res.redirect(loginUrl);
});

app.get('/spotify/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) {
    console.error('Spotify callback error:', error);
    return res.status(400).send(`❌ Spotify rechazó el login: ${error}`);
  }
  if (!code) return res.status(400).send('❌ No se recibió código de Spotify');

  try {
    const result = await exchangeCode(code);
    if (result.status === 200) {
      res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Spotify conectado</title>
<style>body{font-family:monospace;background:#0d1117;color:#c9d1d9;padding:2rem;text-align:center;}
h1{color:#1DB954;}a{color:#58a6ff;}</style></head><body>
<h1>✅ Spotify conectado correctamente</h1>
<p>Ya puedes cerrar esta ventana.</p>
<p>Access token válido por <strong>1 hora</strong> (se renueva automáticamente).</p>
<p><a href="/spotify/status">Ver estado</a> · <a href="/">Inicio</a></p>
</body></html>`);
    } else {
      res.status(500).send(`❌ Error al obtener tokens: ${JSON.stringify(result.body)}`);
    }
  } catch (e) {
    res.status(500).send('❌ Error interno: ' + e.message);
  }
});

app.get('/spotify/status', async (req, res) => {
  if (!SPOTIFY_CLIENT_ID) {
    return res.json({ connected: false, reason: 'SPOTIFY_CLIENT_ID no configurado' });
  }
  if (!spotifyTokens.access_token) {
    return res.json({
      connected : false,
      reason    : 'No autenticado',
      login_url : `${APP_HOST}/spotify/login`,
    });
  }
  const token = await getValidAccessToken();
  if (!token) {
    return res.json({
      connected : false,
      reason    : 'Token expirado y no se pudo renovar',
      login_url : `${APP_HOST}/spotify/login`,
    });
  }
  res.json({
    connected  : true,
    expires_at : new Date(spotifyTokens.expires_at).toISOString(),
    scopes     : SPOTIFY_SCOPES,
  });
});

app.get('/spotify/token', auth, async (req, res) => {
  const token = await getValidAccessToken();
  if (!token) {
    return res.status(401).json({
      error     : 'No hay sesión de Spotify activa',
      login_url : `${APP_HOST}/spotify/login`,
    });
  }
  res.json({ access_token: token });
});

// ─── Home ─────────────────────────────────────────────────────────────────────
app.get('/', async (_req, res) => {
  const spotifyStatus = !SPOTIFY_CLIENT_ID
    ? `<p class="warn">⚠️ SPOTIFY_CLIENT_ID no configurado</p>`
    : !spotifyTokens.access_token
    ? `<p class="warn">⚠️ Spotify no autenticado — <a href="/spotify/login">Haz login aquí</a></p>`
    : `<p class="ok">✅ Spotify conectado</p>`;

  res.send(`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Playwright MCP</title>
<style>
  body{font-family:monospace;background:#0d1117;color:#c9d1d9;padding:2rem;}
  h1{color:#58a6ff;} h2{color:#8b949e;font-size:1rem;margin-top:1.5rem;}
  .box{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1.2rem;margin:.8rem 0;}
  .url{color:#56d364;word-break:break-all;}
  .warn{color:#d29922;} .ok{color:#56d364;}
  a{color:#58a6ff;} code{background:#21262d;padding:2px 6px;border-radius:4px;}
</style></head><body>
<h1>🎭 Playwright MCP Server</h1>
<h2>MCP</h2>
<div class="box"><p class="label">SSE (Claude / n8n / Cursor)</p>
  <p class="url">${APP_HOST}/sse/${API_TOKEN}</p></div>
<div class="box"><p class="label">Streamable HTTP</p>
  <p class="url">${APP_HOST}/mcp?token=${API_TOKEN}</p></div>
<h2>Spotify</h2>
${spotifyStatus}
<div class="box">
  <a href="/spotify/login">🎵 Login con Spotify</a> ·
  <a href="/spotify/status">Estado</a>
</div>
<p><a href="/health">Health</a></p>
</body></html>`);
});

// Health
app.get('/health', (_req, res) => res.json({ status: 'ok', app: APP_HOST }));

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => printConnectionInfo());
