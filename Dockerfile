FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app

RUN npm init -y && npm install @playwright/mcp

EXPOSE 8931

# --host 0.0.0.0 es CLAVE para que Fly.io lo exponga publicamente
CMD ["npx", "@playwright/mcp@latest", \
     "--headless", \
     "--port", "8931", \
     "--host", "0.0.0.0"]
