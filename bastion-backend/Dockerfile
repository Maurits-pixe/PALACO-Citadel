FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3005 \
    DATABASE_PATH=/app/data/bastion.db \
    TLS_CERT_PATH=/run/tls/localhost.pem \
    TLS_KEY_PATH=/run/tls/localhost-key.pem

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node . .
RUN mkdir -p /app/data && chown node:node /app/data

USER node

EXPOSE 3005

CMD ["node", "server.js"]
