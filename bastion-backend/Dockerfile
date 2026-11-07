FROM node:22-bookworm-slim AS build

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .

FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3005 \
    DATABASE_PATH=/app/data/bastion.db \
    TLS_CERT_PATH=/run/tls/localhost.pem \
    TLS_KEY_PATH=/run/tls/localhost-key.pem

WORKDIR /app

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .
RUN mkdir -p /app/data && chown node:node /app/data

USER node

EXPOSE 3005

CMD ["node", "server.js"]
