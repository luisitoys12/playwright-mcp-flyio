FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app

# Instalar MCP + CLI + servidor proxy
RUN npm init -y && \
    npm install @playwright/mcp@latest express && \
    npm install -g @playwright/cli@latest

COPY server.js .

EXPOSE 8080

CMD ["node", "server.js"]
