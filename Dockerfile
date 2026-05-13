FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app

# Copiar package.json primero para aprovechar cache de Docker
COPY package.json .
RUN npm install --omit=dev

# La imagen de Microsoft Playwright ya trae Chromium instalado
# NO hace falta npx playwright install — evita duplicados y errores de ruta

COPY server.js .

EXPOSE 8080

CMD ["node", "server.js"]
