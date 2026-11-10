# ---- Kliner backend (Express) ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
USER node
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3002/health || exit 1
CMD ["node", "app.js"]
