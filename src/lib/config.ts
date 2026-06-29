// Configuração central, lida de variáveis de ambiente (server-side).

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

export const config = {
  // Conexão direta ao Postgres (driver pg). Sem Kong/PostgREST.
  databaseUrl: () => required("DATABASE_URL"),
  adminToken: () => required("APP_ADMIN_TOKEN"),
  encryptionKey: () => required("APP_ENCRYPTION_KEY"),

  cacheTtlSeconds: () => Number(process.env.CACHE_TTL_SECONDS ?? 60),
  opaPageSize: () => Number(process.env.OPA_PAGE_SIZE ?? 1000),
  opaTimeoutMs: () => Number(process.env.OPA_TIMEOUT_MS ?? 30000),
  defaultLookbackDays: () => Number(process.env.DEFAULT_LOOKBACK_DAYS ?? 30),

  // Sessão do dashboard (login usuário/senha). Secret cai p/ a chave de cripto.
  sessionSecret: () => process.env.SESSION_SECRET || required("APP_ENCRYPTION_KEY"),
  sessionTtlHours: () => Number(process.env.SESSION_TTL_HOURS ?? 12),
  // Quantos recursos de um mesmo job rodam em paralelo (threads lógicas).
  resourceConcurrency: () => Number(process.env.WORKER_RESOURCE_CONCURRENCY ?? 3),
  // Agendador interno (worker).
  schedulerEnabled: () => (process.env.SCHEDULER_ENABLED ?? "true") !== "false",
  schedulerIntervalSec: () => Number(process.env.SCHEDULER_INTERVAL_SEC ?? 60),
  revalidateHours: () => Number(process.env.REVALIDATE_HOURS ?? 12),
  // Idade (min) p/ considerar uma run "presa" e marcar interrupted. Full sync
  // grande (ex. mensagens) passa fácil de 15min — default alto evita falso
  // positivo. O guard de job ativo no BullMQ é a proteção principal.
  stuckReconcileMin: () => Number(process.env.STUCK_RECONCILE_MIN ?? 180),
  // Seed do 1º usuário admin do dashboard (cria se a tabela estiver vazia).
  defaultDashUser: () => process.env.DASHBOARD_DEFAULT_USER || "",
  defaultDashPassword: () => process.env.DASHBOARD_DEFAULT_PASSWORD || "",
};
