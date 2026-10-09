FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    PALACO_MEMBERS_FILE=/private/members.json

WORKDIR /app/ambassades/auth
COPY ambassades/auth/package.json ambassades/auth/package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev && npm cache clean --force

COPY ambassades/auth/server.mjs ambassades/auth/access-policy.mjs ambassades/auth/session-store.mjs ambassades/auth/token-verification.mjs ./
COPY ambassades/index.html ambassades/toegang.html ambassades/portal.js ambassades/access-slots.json ../

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(async response => { if (!response.ok || (await response.json()).ok !== true) process.exit(1); }).catch(() => process.exit(1));"]

CMD ["node", "server.mjs"]
