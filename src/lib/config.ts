// Configuração central, lida de variáveis de ambiente (server-side).
import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

export const config = {
  supabaseUrl: () => required("SUPABASE_URL"),
  supabaseServiceKey: () => required("SUPABASE_SERVICE_KEY"),
  adminToken: () => required("APP_ADMIN_TOKEN"),
  encryptionKey: () => required("APP_ENCRYPTION_KEY"),

  cacheTtlSeconds: () => Number(process.env.CACHE_TTL_SECONDS ?? 60),
  opaPageSize: () => Number(process.env.OPA_PAGE_SIZE ?? 500),
  opaTimeoutMs: () => Number(process.env.OPA_TIMEOUT_MS ?? 30000),
  defaultLookbackDays: () => Number(process.env.DEFAULT_LOOKBACK_DAYS ?? 30),
};
