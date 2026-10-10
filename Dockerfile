FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev \
  && mkdir -p uploads \
  && chown node:node uploads

COPY . .

# Runs as the image's unprivileged user; the uploads volume inherits this ownership on first mount.
USER node

EXPOSE 5000

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:5000/health || exit 1

CMD ["node", "src/server.js"]
