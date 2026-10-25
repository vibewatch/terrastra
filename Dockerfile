# The full edition: the globe app (Vite) inside the Next.js server, on Postgres.
#   docker compose --profile app up --build

FROM node:24-bookworm-slim AS build
WORKDIR /app
# Production is Postgres: generate its Prisma client (no connection is made at build time).
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build NEXT_TELEMETRY_DISABLED=1 NEXT_STANDALONE=1
COPY package.json package-lock.json .nvmrc prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run build:web

# Applies the committed migrations, then exits (compose runs it before the app).
FROM build AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:24-bookworm-slim AS app
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/web/.next/standalone ./
COPY --from=build --chown=node:node /app/web/.next/static ./web/.next/static
COPY --from=build --chown=node:node /app/web/public ./web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD ["node", "-e", "fetch('http://localhost:3000/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "web/server.js"]
