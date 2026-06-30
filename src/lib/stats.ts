// Agrega as estatísticas da operação para o dashboard. Cacheado ~30s.
import * as repo from "./repo";
import { listTokens } from "./api-tokens";
import { cacheGet, cacheSet } from "./cache";
// queue importa BullMQ (deps Node-only). Import LAZY p/ não puxar pro bundle
// edge via instrumentation.ts (senão `next build` quebra: crypto/stream/path).
async function queueCountsSafe(): Promise<Record<string, number>> {
  try {
    const { queueCounts } = await import("./queue");
    return (await queueCounts()) as Record<string, number>;
  } catch {
    return {};
  }
}

const MONTHS = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];

// Mantém o cache do dashboard SEMPRE quente: a 1ª chamada da rota arma um timer
// (no processo do app, runtime Node) que reconstrói "stats:overview" a cada
// STATS_REFRESH_SEC (< TTL 30s). Idempotente (flag global). Roda só no servidor.
export function startStatsRefresher(): void {
  const g = globalThis as any;
  if (g.__statsRefresher) return;
  g.__statsRefresher = true;
  const sec = Math.max(Number(process.env.STATS_REFRESH_SEC ?? 25), 5);
  const tick = () => { buildOverview(true).catch(() => {}); };
  void tick();
  const t = setInterval(tick, sec * 1000);
  (t as any).unref?.();
}

export async function buildOverview(force = false) {
  if (!force) {
    const cached = cacheGet("stats:overview");
    if (cached) return cached;
  }

  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthLabel = `${MONTHS[now.getMonth()]}/${now.getFullYear()}`;

  const [clients, runs, byResource, tokens, queue, tcounts, recent, timings] = await Promise.all([
    repo.listClients(),
    repo.allRunsLite(),
    repo.perResourceCounts(),
    listTokens(),
    queueCountsSafe(),
    repo.tokenCounts(),
    repo.listRecentRuns(20),
    repo.syncTimings(),
  ]);

  const thisMonth = runs.filter((r) => r.started_at >= since);
  const activeClientsThisMonth = new Set(thisMonth.map((r) => r.client_id)).size;

  const runsByClient = new Map<string, typeof runs>();
  for (const r of runs) {
    const arr = runsByClient.get(r.client_id) ?? [];
    arr.push(r);
    runsByClient.set(r.client_id, arr);
  }
  const tokensByClient = new Map<string, number>();
  for (const t of tokens) if (t.client_id && t.active) tokensByClient.set(t.client_id, (tokensByClient.get(t.client_id) ?? 0) + 1);

  const per_client = clients.map((c) => {
    const cr = runsByClient.get(c.id) ?? [];
    const okc = cr.filter((r) => r.status === "ok").length;
    return {
      id: c.id,
      slug: c.slug,
      name: c.name,
      active: c.active,
      last_sync_status: c.last_sync_status,
      last_synced_at: c.last_synced_at,
      sync_count: cr.length,
      syncs_this_month: cr.filter((r) => r.started_at >= since).length,
      total_upserted: cr.reduce((a, r) => a + (r.total_upserted || 0), 0),
      ok_rate: cr.length ? Math.round((okc / cr.length) * 100) : null,
      avg_ms: timings.by_client[c.id] ?? null,
      blocked: (c.blocked_resources ?? []).length,
      tokens: tokensByClient.get(c.id) ?? 0,
    };
  });

  const recordsTotal = Object.values(byResource).reduce((a, n) => a + n, 0);

  const overview = {
    generated_at: now.toISOString(),
    month: { label: monthLabel, since },
    clients: {
      total: clients.length,
      active: clients.filter((c) => c.active).length,
      inactive: clients.filter((c) => !c.active).length,
      with_errors: clients.filter((c) => c.last_sync_status === "error").length,
      blocked: clients.filter((c) => (c.blocked_resources ?? []).length > 0).length,
    },
    active_clients_this_month: activeClientsThisMonth,
    syncs: {
      total: runs.length,
      ok: runs.filter((r) => r.status === "ok").length,
      error: runs.filter((r) => r.status === "error").length,
      this_month: thisMonth.length,
      ok_this_month: thisMonth.filter((r) => r.status === "ok").length,
      error_this_month: thisMonth.filter((r) => r.status === "error").length,
      avg_ms: timings.overall_ms,
    },
    records: { total: recordsTotal, by_resource: byResource },
    queue,
    tokens: tcounts,
    per_client,
    recent_runs: recent,
  };

  cacheSet("stats:overview", overview, 30);
  return overview;
}
