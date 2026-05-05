# 🎭 Playwright MCP Server — Fly.io

Servidor MCP remoto con Playwright (Chromium headless) desplegado en Fly.io. Incluye página de bienvenida, autenticación por Bearer token y proxy SSE.

## 🚀 Deploy rápido

```bash
git clone https://github.com/luisitoys12/playwright-mcp-flyio.git
cd playwright-mcp-flyio

# Crear app
fly apps create playwright-mcp-kus --org TU-ORG

# Configurar tu token secreto
fly secrets set MCP_AUTH_TOKEN=tu-token-aqui --app playwright-mcp-kus

# Desplegar
fly deploy
```

## 🔒 Autenticación

El endpoint `/sse` requiere un Bearer token:

```
Authorization: Bearer <MCP_AUTH_TOKEN>
```

O via query param: `https://playwright-mcp-kus.fly.dev/sse?token=<MCP_AUTH_TOKEN>`

## 🔌 Conectar con Perplexity Pro

1. **Settings → Connectors → + Custom Connector → Remote**
2. URL: `https://playwright-mcp-kus.fly.dev/sse`
3. Header: `Authorization: Bearer <tu-token>`

## 🛠️ Herramientas MCP disponibles

`browser_navigate` `browser_click` `browser_fill` `browser_screenshot`
`browser_get_text` `browser_evaluate` `browser_wait_for` `browser_select`
`browser_hover` `browser_scroll`

## 🌎 Región

`dfw` (Dallas) — menor latencia desde México.

## 📄 Licencia

MIT
