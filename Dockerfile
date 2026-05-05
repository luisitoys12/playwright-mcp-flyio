FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app

RUN npm init -y && npm install @playwright/mcp@latest express

COPY server.js .

EXPOSE 8080

CMD ["node", "server.js"]
