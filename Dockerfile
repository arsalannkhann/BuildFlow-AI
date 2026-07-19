# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS workspace
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

FROM workspace AS web-builder
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @buildflow/web build

# The matching Playwright runtime supplies Chromium and its system dependencies for issued
# DPR/compliance PDFs. The Next standalone output contains only the traced application files.
FROM mcr.microsoft.com/playwright:v1.61.1-noble AS web
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=8080
ENV BUILDFLOW_REPO_ROOT=/app
WORKDIR /app
COPY --from=web-builder /app/apps/web/.next/standalone ./
COPY --from=web-builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-builder /app/packages/db/drizzle ./packages/db/drizzle
# pnpm's transitive server packages live outside Next's standalone trace. Copy the Linux
# workspace store plus the web package links so externalized database, AI, storage and PDF
# modules resolve at runtime. Cloud Build installs these dependencies; local host modules never
# enter the image because node_modules is excluded from the build context.
COPY --from=web-builder /app/node_modules ./node_modules
COPY --from=web-builder /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=web-builder /app/packages/db/node_modules/@electric-sql ./apps/web/node_modules/@electric-sql
COPY --from=web-builder /app/packages/db/node_modules/pg ./apps/web/node_modules/pg
COPY --from=web-builder /app/packages/pdf/node_modules/playwright ./apps/web/node_modules/playwright
COPY --from=web-builder /app/packages/ai/node_modules/@google ./apps/web/node_modules/@google
COPY --from=web-builder /app/packages/storage/node_modules/@google-cloud ./apps/web/node_modules/@google-cloud
CMD ["node", "apps/web/server.js"]

# The worker executes TypeScript through tsx because internal workspace packages intentionally
# export their TypeScript sources. This target retains the installed workspace but not local data.
FROM workspace AS worker
ENV NODE_ENV=production
ENV BUILDFLOW_REPO_ROOT=/app
CMD ["pnpm", "--filter", "@buildflow/worker", "start"]

# VM production web: run Next from the full installed workspace (pnpm-native resolution —
# no hand-copied module layout) with Chromium for issued-PDF rendering. Heavier than the
# traced `web` target; correctness over size on our own VM.
FROM web-builder AS web-vm
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV BUILDFLOW_REPO_ROOT=/app
RUN pnpm --filter @buildflow/web exec playwright install --with-deps chromium
# Next keeps a require() for serverExternalPackages in the emitted chunks even behind a
# dynamic import, and the standalone tree has no pnpm store. Materialise the externals the
# server can reach so module resolution succeeds; PGlite still only initialises when
# DATABASE_URL is unset.
RUN set -eux; \
    STANDALONE=/app/apps/web/.next/standalone; \
    mkdir -p "$STANDALONE/node_modules/@electric-sql"; \
    cp -RL /app/packages/db/node_modules/@electric-sql/pglite "$STANDALONE/node_modules/@electric-sql/pglite"; \
    # Next excludes .next/static and public/ from standalone output: the server expects them
    # beside itself, otherwise every CSS/JS asset 404s and the app renders unstyled.
    cp -R /app/apps/web/.next/static "$STANDALONE/apps/web/.next/static"; \
    if [ -d /app/apps/web/public ]; then cp -R /app/apps/web/public "$STANDALONE/apps/web/public"; fi
WORKDIR /app/apps/web
# Standalone output ignores `next start`; run the generated server from the workspace so
# pnpm-linked transitive deps (pg, playwright, google-cloud) still resolve.
CMD ["node", ".next/standalone/apps/web/server.js"]
