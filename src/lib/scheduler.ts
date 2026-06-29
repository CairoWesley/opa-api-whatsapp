// Agendador interno (roda no worker, via job repetível do BullMQ).
// A cada tick: re-enfileira clientes ATIVOS cujo sync está vencido e revalida
// o token dos que estão com a validação velha. Um job por cliente (a fila
// processa em paralelo). Dedup por jobId evita enfileirar o mesmo 2x.
import * as repo from "./repo";
import { enqueueSync, activeSyncClientIds } from "./queue";
import { revalidateClient } from "./extractor";
import { config } from "./config";

// Maior timestamp de validação dentre os recursos (ms), ou 0 se nunca validou.
function lastRevalidatedMs(access: Record<string, { at: string }> | null | undefined): number {
  if (!access) return 0;
  let max = 0;
  for (const v of Object.values(access)) {
    const t = v?.at ? Date.parse(v.at) : 0;
    if (t > max) max = t;
  }
  return max;
}

export async function runScheduler(): Promise<{ enqueued: string[]; revalidated: string[] }> {
  // Config vinda do PAINEL (app_settings), com fallback p/ env.
  const s = await repo.getSettings().catch(() => ({} as Record<string, any>));
  const resyncOn = s.auto_resync_enabled ?? true;
  const revalOn = s.auto_revalidate_enabled ?? true;
  const revalidateMs = Number(s.revalidate_hours ?? config.revalidateHours()) * 3600_000;

  // Reconcilia execuções presas (worker que morreu sem reportar). Só marca
  // interrupted as antigas (> stuckReconcileMin) E que NÃO têm job ativo no
  // BullMQ — full grande legítimo (>min) não é falso-positivo.
  const active = await activeSyncClientIds().catch(() => [] as string[]);
  await repo.reconcileStuck(config.stuckReconcileMin(), active).catch(() => {});

  const enqueued: string[] = [];
  const revalidated: string[] = [];
  if (!resyncOn && !revalOn) return { enqueued, revalidated };

  const clients = await repo.listClients(true); // só ATIVOS
  const now = Date.now();

  for (const c of clients) {
    // 1) Re-sync automático se vencido (sync programado por sync_interval_minutes).
    if (resyncOn) {
      const intervalMs = (c.sync_interval_minutes || 30) * 60_000;
      const lastSync = c.last_synced_at ? Date.parse(c.last_synced_at) : 0;
      const due = !lastSync || now - lastSync >= intervalMs;
      const busy = c.last_sync_status === "running" || c.last_sync_status === "queued";
      if (due && !busy) {
        await enqueueSync({ clientId: c.id }).catch(() => {});
        enqueued.push(c.slug);
      }
    }
    // 2) Revalida o token se a validação está velha (ou nunca foi feita).
    if (revalOn) {
      const lastVal = lastRevalidatedMs(c.resource_access);
      if (!lastVal || now - lastVal >= revalidateMs) {
        await revalidateClient(c.id).catch(() => {});
        revalidated.push(c.slug);
      }
    }
  }
  return { enqueued, revalidated };
}
