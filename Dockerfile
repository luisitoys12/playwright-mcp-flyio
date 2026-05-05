FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app

# Instalar dependencias
RUN npm init -y && \
    npm install @playwright/mcp express http-proxy-middleware

COPY server.js .

EXPOSE 8080

# Arrancamos nuestro servidor proxy (no el MCP directamente)
CMD ["node", "server.js"]
