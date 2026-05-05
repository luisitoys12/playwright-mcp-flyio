# Imagen base oficial de Playwright (Ubuntu Noble) - ya trae las librerias del sistema
FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app

# Instalar dependencias Node
RUN npm init -y && npm install @playwright/mcp@latest express

# Instalar los browsers que necesita el MCP
# chromium = principal para el MCP
# firefox y webkit = opcionales pero utiles para testing
RUN npx playwright install chromium firefox webkit

# Instalar dependencias del sistema para los browsers (por si acaso)
RUN npx playwright install-deps chromium

COPY server.js .

EXPOSE 8080

CMD ["node", "server.js"]
