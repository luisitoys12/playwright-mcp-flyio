# 🎭 Playwright MCP Server — Fly.io

Servidor MCP remoto de Playwright listo para desplegar en Fly.io. Permite usar automatización de navegador real (Chromium headless) como herramienta MCP desde Perplexity Pro, Claude, n8n y más.

## 🚀 Deploy rápido

```bash
# 1. Clona el repo
git clone https://github.com/luisitoys12/playwright-mcp-flyio.git
cd playwright-mcp-flyio

# 2. Crea la app en tu org de Fly.io
fly apps create playwright-mcp-kus --org TU-ORG

# 3. Despliega
fly deploy
```

Tu endpoint quedará en:
```
https://playwright-mcp-kus.fly.dev/sse
```

## 🔌 Conectar con Perplexity Pro

1. Ve a **Settings → Connectors → + Custom Connector → Remote**
2. URL: `https://playwright-mcp-kus.fly.dev/sse`
3. Auth: `None` (o agrega un Bearer token)
4. Actívalo desde **Sources** en el chat

## 🔒 Agregar seguridad (opcional)

```bash
# Genera y guarda un token secreto
fly secrets set MCP_AUTH_TOKEN=$(openssl rand -hex 32)

# Luego en Perplexity agrega el header:
# Authorization: Bearer <tu-token>
```

## 📋 Requisitos

- Cuenta en [Fly.io](https://fly.io) con `flyctl` instalado
- Mínimo **2 GB RAM** en la máquina (Chromium lo necesita)
- Perplexity Pro, Claude, o cualquier cliente MCP compatible

## 🌎 Región recomendada para México

`mia` (Miami) — menor latencia desde México.

## 🛠️ Herramientas disponibles vía MCP

Este servidor expone todas las herramientas de `@playwright/mcp`:
- Navegar URLs
- Hacer clic, llenar formularios
- Extraer contenido de páginas
- Tomar screenshots
- Manejar autenticación y cookies
- Scraping de SPAs y páginas con JavaScript

## 📄 Licencia

MIT — Libre para usar y modificar.
