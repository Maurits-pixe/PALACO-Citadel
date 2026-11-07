FROM node:22-bookworm-slim AS frontend-build

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build:launcher \
    && npm run build \
    && npm run build:bastion

FROM nginx:alpine

COPY --chown=nginx:nginx . /usr/share/nginx/html
COPY --from=frontend-build --chown=nginx:nginx /app/citadel /usr/share/nginx/html/citadel
COPY nginx.conf /etc/nginx/nginx.conf

USER nginx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
