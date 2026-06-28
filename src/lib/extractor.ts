// Lógica de extração (sync) multi-cliente OPA Suite -> Supabase.
// Espelha a DAG de produção: itera recursos, pagina por skip/limit, upsert por _id.
import { config } from "./config";
import { cacheInvalidatePrefix, cacheSet, buildDataKey } from "./cache";
import { decryptToken } from "./crypto";
import { OpaClient, OpaError, type OpaDoc } from "./opa-client";
import { getResource, RESOURCE_KEYS, type Resource } from "./resources";
import * as repo from "./repo";
import type { ClientSecretRow, ResourceSyncResult, SyncResult } from "./types";

const BATCH = 1000;

// Executa fn sobre items com no máx. `n` em paralelo (pool de "threads" lógicas).
async function mapPool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function runner() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(n, 1), items.length) }, runner));
  return out;
}

// Monta as PASSADAS de filtro de um recurso.
//   - override (query custom): 1 passada exatamente com o filtro dado.
//   - full = true (1º sync ou forçado): 1 passada SEM data → puxa tudo.
//   - incremental: 1 passada por campo de data (abertura/encerramento), cada
//     uma com `campo >= since`. O upsert por _id mescla/deduplica.
function buildPasses(
  resource: Resource,
  client: ClientSecretRow,
  full: boolean,
  override?: Record<string, unknown>,
): Record<string, unknown>[] {
  if (override) return [override];

  const base = (client.extra_filters ?? {})[resource.key] ?? {};
  if (full || !resource.incrementalDates?.length) return [{ ...base }];

  const lookback = client.lookback_days || config.defaultLookbackDays();
  const since = new Date(Date.now() - lookback * 86400_000).toISOString().slice(0, 10);
  return resource.incrementalDates.map((field) => ({ ...base, [field]: since }));
}

async function syncResource(
  opa: OpaClient,
  client: ClientSecretRow,
  resource: Resource,
  full: boolean,
  override?: Record<string, unknown>,
): Promise<ResourceSyncResult> {
  const passes = buildPasses(resource, client, full, override);
  let total = 0;
  let flush = 0;
  try {
    for (const filter of passes) {
      let batch: OpaDoc[] = [];
      for await (const doc of opa.iterDocuments(resource.path, filter)) {
        batch.push(doc);
        if (batch.length >= BATCH) {
          total += await repo.upsertDocuments(client.id, resource.key, batch);
          batch = [];
          // Checkpoint do kill switch (a cada 3 lotes p/ não martelar o banco).
          if (++flush % 3 === 0 && (await repo.isCancelRequested(client.id))) {
            return { resource: resource.key, status: "cancelled", records_upserted: total };
          }
        }
      }
      if (batch.length) total += await repo.upsertDocuments(client.id, resource.key, batch);
      if (await repo.isCancelRequested(client.id)) {
        return { resource: resource.key, status: "cancelled", records_upserted: total };
      }
    }
    await repo.insertSyncLog(client.id, resource.key, "ok", total, null).catch(() => {});
    return { resource: resource.key, status: "ok", records_upserted: total };
  } catch (err) {
    const msg = err instanceof OpaError ? err.message : String(err);
    const permission_error = err instanceof OpaError && (err.statusCode === 401 || err.statusCode === 403);
    await repo.insertSyncLog(client.id, resource.key, "error", total, msg).catch(() => {});
    return { resource: resource.key, status: "error", records_upserted: total, error: msg, permission_error };
  }
}

export async function syncClient(
  clientId: string,
  resources?: string[],
  override?: Record<string, unknown>,
  forceFull?: boolean,
): Promise<SyncResult> {
  const client = await repo.getClientSecret(clientId);
  // Cliente removido/arquivado entre o enfileiramento e a execução → no-op
  // (não relança erro, p/ o job não ficar em loop de retry).
  if (!client) return { client_id: clientId, client_slug: "?", status: "error", resources: [], total_upserted: 0 };

  const startedAt = new Date().toISOString();
  const requested = resources?.length ? resources : RESOURCE_KEYS;
  // Pula recursos BLOQUEADOS (401/403, até revalidar) e DESABILITADOS (escolha do admin).
  const skip = new Set([...(client.blocked_resources ?? []), ...(client.disabled_resources ?? [])]);
  const keys = requested.filter((k) => !skip.has(k));
  // 1º sync (nunca sincronizado) = FULL automático. Override ignora full.
  const full = !override && (forceFull === true || client.last_synced_at == null);
  // Limpa flag de cancelamento de uma execução anterior.
  await repo.clearCancel(clientId).catch(() => {});
  // "running" + carimba a TENTATIVA (last_synced_at = última vez que tentou,
  // independente de sucesso).
  await repo.setSyncState(clientId, "running", null, true);

  const token = decryptToken(client.token_encrypted);
  const opa = new OpaClient({
    baseUrl: client.base_url,
    token,
    pageSize: client.page_size || config.opaPageSize(),
    timeoutMs: client.timeout_ms || config.opaTimeoutMs(),
    insecureTls: client.insecure_tls,
  });

  let results: ResourceSyncResult[] = [];
  let hadError = false;
  try {
    // Recursos do job rodam em paralelo (pool configurável).
    results = await mapPool(keys, config.resourceConcurrency(), (key) =>
      syncResource(opa, client, getResource(key), full, override),
    );
    hadError = results.some((r) => r.status === "error");
  } catch (err) {
    await repo.setSyncState(clientId, "error", String(err), false);
    throw err;
  }

  // Recursos com 401/403 saem da fila desse cliente até revalidar o token.
  const newlyBlocked = results.filter((r) => r.permission_error).map((r) => r.resource);
  if (newlyBlocked.length) {
    const merged = Array.from(new Set([...(client.blocked_resources ?? []), ...newlyBlocked]));
    await repo.setBlockedResources(clientId, merged);
  }

  const cancelled = results.some((r) => r.status === "cancelled");
  const status = cancelled ? "cancelled" : hadError ? "error" : "ok";
  const errSummary = cancelled
    ? "cancelado pelo usuário"
    : results.filter((r) => r.error).map((r) => `${r.resource}: ${r.error}`).join("; ") || null;
  // Limpa o flag de cancelamento e grava o status final.
  await repo.clearCancel(clientId).catch(() => {});
  // Não re-carimba last_synced_at (já foi no início = tentativa). Só o status.
  await repo.setSyncState(clientId, status, errSummary, false);

  const totalUpserted = results.reduce((a, r) => a + r.records_upserted, 0);
  await repo.insertSyncRun({
    client_id: clientId,
    status,
    is_full: full,
    resources_count: results.length,
    ok_count: results.filter((r) => r.status === "ok").length,
    error_count: results.filter((r) => r.status === "error").length,
    total_upserted: totalUpserted,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  }).catch(() => {});

  cacheInvalidatePrefix(`data:${clientId}:`);
  cacheInvalidatePrefix("stats:");
  await warmClientCache(clientId, keys).catch(() => {});

  return { client_id: clientId, client_slug: client.slug, status, resources: results, total_upserted: totalUpserted };
}

// Pré-carrega o cache da 1ª página (limit 100, mais recentes) de cada recurso
// sincronizado, batendo a chave canônica da read API. Leitura pós-sync já vem
// quente. Falha de warm é silenciosa (não impacta o sync).
const WARM_LIMIT = 100;
export async function warmClientCache(clientId: string, keys: string[]): Promise<void> {
  for (const resource of keys) {
    const { rows, total } = await repo.queryDocuments(clientId, resource, WARM_LIMIT, 0, true, [], "synced_at");
    const key = buildDataKey({
      clientId,
      resource,
      limit: WARM_LIMIT,
      offset: 0,
      orderBy: "synced_at",
      orderDesc: true,
      filters: [],
    });
    cacheSet(key, {
      resource,
      client_id: clientId,
      filters: [],
      pagination: {
        limit: WARM_LIMIT,
        offset: 0,
        page: 1,
        total,
        returned: rows.length,
        has_more: rows.length < total,
      },
      data: rows,
    });
  }
}

// Revalida o token: faz um GET (limit 1) em CADA rota e descobre a quais o
// token tem acesso. Atualiza resource_access + blocked_resources (rotas 401/403
// ficam bloqueadas; as que voltarem a responder 200 são desbloqueadas).
export async function revalidateClient(clientId: string): Promise<{
  access: Record<string, { ok: boolean; code: number; at: string }>;
  blocked: string[];
}> {
  const client = await repo.getClientSecret(clientId);
  if (!client) throw new Error(`Cliente ${clientId} não encontrado`);
  const token = decryptToken(client.token_encrypted);
  const opa = new OpaClient({
    baseUrl: client.base_url,
    token,
    timeoutMs: client.timeout_ms || config.opaTimeoutMs(),
    insecureTls: client.insecure_tls,
    maxRetries: 0,
  });

  const at = new Date().toISOString();
  const access: Record<string, { ok: boolean; code: number; at: string }> = {};
  const blocked: string[] = [];
  await mapPool(RESOURCE_KEYS, config.resourceConcurrency(), async (key) => {
    const r = await opa.probe(getResource(key).path);
    access[key] = { ok: r.ok, code: r.code, at };
    if (!r.ok && (r.code === 401 || r.code === 403)) blocked.push(key);
  });

  await repo.setResourceAccess(clientId, access, blocked);
  return { access, blocked };
}

export async function syncAllActive(): Promise<SyncResult[]> {
  const clients = await repo.listClients(true);
  const out: SyncResult[] = [];
  for (const c of clients) {
    try {
      out.push(await syncClient(c.id));
    } catch (err) {
      out.push({
        client_id: c.id,
        client_slug: c.slug,
        status: "error",
        resources: [],
        total_upserted: 0,
      });
    }
  }
  return out;
}
