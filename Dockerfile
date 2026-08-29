FROM node:22-bookworm-slim AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY daemon ./daemon

RUN mkdir -p /app/daemon/data /app/deployments \
    && chown -R node:node /app

USER node

CMD ["npm", "run", "daemon"]
