# Build context is apps/web: the web application has its own manifest and
# lockfile, so it does not need the repository around it.

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
# No network call happens here: every page is `force-dynamic`, so the build
# does not depend on the BFF being up.
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
# `standalone` emits server.js plus the node_modules it actually traced.
# Static assets are not part of that trace and have to come across separately,
# or the app serves unstyled HTML with 404s on every chunk.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
