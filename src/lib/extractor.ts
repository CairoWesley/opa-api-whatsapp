// Lógica de extração (sync) multi-cliente OPA Suite -> Supabase.
// Espelha a DAG de produção: itera recursos, pagina por skip/limit, upsert por _id.
import "server-only";
import { config } from "./config";
import { cacheInvalidatePrefix } from "./cache";
import { decryptToken } from "./crypto";
import { OpaClient, OpaError, type OpaDoc } from "./opa-client";
import { getResource, RESOURCE_KEYS, type Resource } from "./resources";
import * as repo from "./repo";
import type { ClientSecretRow, ResourceSyncResult, SyncResult } from "./types";

const BATCH = 500;

// Precedência do filtro: override (query) > extra_filters do cliente > janela incremental.
function buildFilter(
  resource: Resource,
  client: ClientSecretRow,
  override?: Record<string, unknown>,
): Record<string, unknown> {
  if (override) return override;
  const extra = (client.extra_filters ?? {})[resource.key] ?? {};
  const filter: Record<string, unknown> = { ...extra };
  if (resource.dateFilter && !(resource.dateFilter in filter)) {
    const lookback = client.lookback_days || config.defaultLookbackDays();
    const since = new Date(Date.now() - lookback * 86400_000).toISOString().slice(0, 10);
    filter[resource.dateFilter] = since;
  }
  return filter;
}

async function syncResource(
  opa: OpaClient,
  client: ClientSecretRow,
  resource: Resource,
  override?: Record<string, unknown>,
): Promise<ResourceSyncResult> {
  const filter = buildFilter(resource, client, override);
  let total = 0;
  let batch: OpaDoc[] = [];
  try {
    for await (const doc of opa.iterDocuments(resource.path, filter)) {
      batch.push(doc);
      if (batch.length >= BATCH) {
        total += await repo.upsertDocuments(client.id, resource.key, batch);
        batch = [];
      }
    }
    if (batch.length) total += await repo.upsertDocuments(client.id, resource.key, batch);
    await repo.insertSyncLog(client.id, resource.key, "ok", total, null);
    return { resource: resource.key, status: "ok", records_upserted: total };
  } catch (err) {
    const msg = err instanceof OpaError ? err.message : String(err);
    await repo.insertSyncLog(client.id, resource.key, "error", total, msg);
    return { resource: resource.key, status: "error", records_upserted: total, error: msg };
  }
}

export async function syncClient(
  clientId: string,
  resources?: string[],
  override?: Record<string, unknown>,
): Promise<SyncResult> {
  const client = await repo.getClientSecret(clientId);
  if (!client) throw new Error(`Cliente ${clientId} não encontrado`);

  const keys = resources?.length ? resources : RESOURCE_KEYS;
  await repo.setSyncState(clientId, "running");

  const token = decryptToken(client.token_encrypted);
  const opa = new OpaClient({
    baseUrl: client.base_url,
    token,
    pageSize: config.opaPageSize(),
    timeoutMs: config.opaTimeoutMs(),
  });

  const results: ResourceSyncResult[] = [];
  let hadError = false;
  try {
    for (const key of keys) {
      const res = await syncResource(opa, client, getResource(key), override);
      results.push(res);
      if (res.status === "error") hadError = true;
    }
  } catch (err) {
    await repo.setSyncState(clientId, "error", String(err), false);
    throw err;
  }

  const status = hadError ? "error" : "ok";
  const errSummary =
    results
      .filter((r) => r.error)
      .map((r) => `${r.resource}: ${r.error}`)
      .join("; ") || null;
  await repo.setSyncState(clientId, status, errSummary, true);
  cacheInvalidatePrefix(`data:${clientId}:`);

  return {
    client_id: clientId,
    client_slug: client.slug,
    status,
    resources: results,
    total_upserted: results.reduce((a, r) => a + r.records_upserted, 0),
  };
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
