FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app

RUN npm init -y && npm install @playwright/mcp@latest

EXPOSE 8931

# --allowed-hosts * desactiva la restriccion de localhost (DNS rebinding protection)
# --allowed-origins * permite CORS desde cualquier cliente
CMD ["npx", "@playwright/mcp@latest", \
     "--headless", \
     "--port", "8931", \
     "--host", "0.0.0.0", \
     "--allowed-hosts", "*"]
