# ── deps ──────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── build ─────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build não precisa de credenciais reais (config é lazy, lida em runtime).
RUN npm run build

# ── runner ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Documentação servida dentro do admin (lida do filesystem em runtime).
COPY --from=builder /app/README.md /app/RESUMO-PROJETO.md ./
COPY --from=builder /app/docs ./docs
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

# ── worker ────────────────────────────────────────────────────────────────────
# Container separado que consome a fila BullMQ e roda a extração (via tsx).
FROM node:22-alpine AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.json package.json ./
COPY src ./src
CMD ["node", "node_modules/tsx/dist/cli.mjs", "src/worker/main.ts"]
