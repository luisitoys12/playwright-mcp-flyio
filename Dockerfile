FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app

RUN npm init -y && npm install @playwright/mcp@latest

EXPOSE 8931

# Correr MCP directamente expuesto en 0.0.0.0 con origins abiertos
CMD ["node", "node_modules/@playwright/mcp/cli.js", \
     "--headless", \
     "--port", "8931", \
     "--host", "0.0.0.0", \
     "--allowed-origins", "*"]
