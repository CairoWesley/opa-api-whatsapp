// Acesso de dados — DIRETO no Postgres (driver pg). Sem Kong/PostgREST.
import { q, q1, exec } from "./db";
import { config } from "./config";
import { hashPassword } from "./session";
import { tableFor, typedColumns, mapTypedColumns } from "./mappers";
import { RESOURCE_KEYS } from "./resources";
import type { ClientRow, ClientSecretRow } from "./types";
import type { OpaDoc } from "./opa-client";

export type DashUser = { id: string; username: string; password_hash: string; active: boolean; role: string };
export type DocFilter = { field: string; op: string; value: string };

const CLIENT_COLS =
  "id, slug, name, base_url, company_id, active, archived, insecure_tls, page_size, timeout_ms, " +
  "sync_interval_minutes, lookback_days, blocked_resources, disabled_resources, resource_access, extra_filters, " +
  "last_synced_at, last_sync_status, last_sync_error, created_at, updated_at";

const nowIso = () => new Date().toISOString();
const jb = (o: unknown) => JSON.stringify(o ?? {});

// ── Clientes ────────────────────────────────────────────────────────────────
// Por padrão exclui ARQUIVADOS. includeArchived=true traz todos.
export async function listClients(active?: boolean, includeArchived = false): Promise<ClientRow[]> {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (!includeArchived) conds.push("archived = false");
  if (active !== undefined) { params.push(active); conds.push(`active = $${params.length}`); }
  const where = conds.length ? `where ${conds.join(" and ")}` : "";
  return q<ClientRow>(`select ${CLIENT_COLS} from opa_clients ${where} order by created_at`, params);
}

export async function getClient(id: string): Promise<ClientRow | null> {
  return q1<ClientRow>(`select ${CLIENT_COLS} from opa_clients where id = $1`, [id]);
}

export async function getClientSecret(id: string): Promise<ClientSecretRow | null> {
  return q1<ClientSecretRow>(`select ${CLIENT_COLS}, token_encrypted from opa_clients where id = $1`, [id]);
}

export async function insertClient(row: Record<string, any>): Promise<ClientRow> {
  const r = await q1<ClientRow>(
    `insert into opa_clients
       (slug, name, base_url, token_encrypted, company_id, active, insecure_tls,
        page_size, timeout_ms, sync_interval_minutes, lookback_days, extra_filters)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     returning ${CLIENT_COLS}`,
    [row.slug, row.name, row.base_url, row.token_encrypted, row.company_id ?? null,
     row.active ?? true, row.insecure_tls ?? false, row.page_size ?? null, row.timeout_ms ?? null,
     row.sync_interval_minutes ?? 30, row.lookback_days ?? 30, jb(row.extra_filters)],
  );
  return r as ClientRow;
}

const JSONB_KEYS = new Set(["extra_filters", "resource_access"]);
export async function updateClient(id: string, patch: Record<string, any>): Promise<ClientRow | null> {
  const keys = Object.keys(patch);
  if (keys.length === 0) return getClient(id);
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  for (const k of keys) {
    sets.push(`${k} = $${i++}`);
    params.push(JSONB_KEYS.has(k) ? jb(patch[k]) : patch[k]);
  }
  params.push(id);
  return q1<ClientRow>(`update opa_clients set ${sets.join(", ")} where id = $${i} returning ${CLIENT_COLS}`, params);
}

export async function deleteClient(id: string): Promise<void> {
  await exec(`delete from opa_clients where id = $1`, [id]);
}

export async function setSyncState(id: string, status: string, errorMsg: string | null = null, markSynced = false): Promise<void> {
  if (markSynced)
    await exec(`update opa_clients set last_sync_status=$1, last_sync_error=$2, last_synced_at=now() where id=$3`, [status, errorMsg, id]);
  else
    await exec(`update opa_clients set last_sync_status=$1, last_sync_error=$2 where id=$3`, [status, errorMsg, id]);
}

// ── Kill switch do sync ─────────────────────────────────────────────────────
export async function requestCancel(id: string | null): Promise<number> {
  // id null = cancela TODOS os que estão rodando/na fila (kill switch global).
  if (id) return exec(`update opa_clients set cancel_requested = true where id = $1`, [id]);
  return exec(`update opa_clients set cancel_requested = true where last_sync_status in ('running','queued')`);
}
export async function clearCancel(id: string): Promise<void> {
  await exec(`update opa_clients set cancel_requested = false where id = $1`, [id]);
}
export async function isCancelRequested(id: string): Promise<boolean> {
  return (await q1<{ c: boolean }>(`select cancel_requested as c from opa_clients where id = $1`, [id]))?.c ?? false;
}

export async function setBlockedResources(id: string, blocked: string[]): Promise<void> {
  await exec(`update opa_clients set blocked_resources=$1 where id=$2`, [blocked, id]);
}

export async function setResourceAccess(id: string, access: Record<string, unknown>, blocked: string[]): Promise<void> {
  await exec(`update opa_clients set resource_access=$1, blocked_resources=$2 where id=$3`, [jb(access), blocked, id]);
}

// ── Documentos (upsert direto, lote único) ──────────────────────────────────
export async function upsertDocuments(clientId: string, resource: string, docs: OpaDoc[]): Promise<number> {
  if (docs.length === 0) return 0;
  const table = tableFor(resource);
  const typed = typedColumns(resource);
  const cols = ["client_id", "external_id", ...typed, "raw", "synced_at"];
  const synced = nowIso();

  const rows: unknown[][] = [];
  for (const d of docs) {
    const externalId = String(d._id ?? d.id ?? "");
    if (!externalId) continue;
    const mapped = mapTypedColumns(resource, d);
    rows.push([clientId, externalId, ...typed.map((k) => mapped[k]), JSON.stringify(d), synced]);
  }
  if (rows.length === 0) return 0;

  const n = cols.length;
  const valuesSql = rows.map((_, ri) => `(${cols.map((_, ci) => `$${ri * n + ci + 1}`).join(",")})`).join(",");
  const updateSet = [...typed, "raw", "synced_at"].map((c) => `${c}=excluded.${c}`).join(", ");
  const sql = `insert into ${table} (${cols.join(",")}) values ${valuesSql}
               on conflict (client_id, external_id) do update set ${updateSet}`;
  await exec(sql, rows.flat());
  return rows.length;
}

// Colunas-base de toda tabela de recurso.
const BASE_COLUMNS = new Set(["external_id", "synced_at", "client_id", "id"]);
function colRef(resource: string, field: string): string {
  if (BASE_COLUMNS.has(field) || typedColumns(resource).includes(field)) return field;
  if (!field.includes(".")) return `raw->>'${field}'`;
  const parts = field.split(".");
  const last = parts.pop();
  return `raw->${parts.map((p) => `'${p}'`).join("->")}->>'${last}'`;
}

export async function queryDocuments(
  clientId: string | null, resource: string, limit: number, offset: number,
  orderDesc: boolean, filters: DocFilter[] = [], orderBy = "synced_at",
): Promise<{ rows: unknown[]; total: number }> {
  const table = tableFor(resource);
  const conds: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (clientId) { conds.push(`client_id = $${i++}`); params.push(clientId); }
  for (const f of filters) {
    const col = colRef(resource, f.field);
    if (f.op === "eq") { conds.push(`${col} = $${i++}`); params.push(f.value); }
    else if (f.op === "neq") { conds.push(`${col} <> $${i++}`); params.push(f.value); }
    else if (f.op === "like" || f.op === "ilike") { conds.push(`${col} ilike $${i++}`); params.push(`%${f.value}%`); }
    else if (f.op === "gt") { conds.push(`${col} > $${i++}`); params.push(f.value); }
    else if (f.op === "gte") { conds.push(`${col} >= $${i++}`); params.push(f.value); }
    else if (f.op === "lt") { conds.push(`${col} < $${i++}`); params.push(f.value); }
    else if (f.op === "lte") { conds.push(`${col} <= $${i++}`); params.push(f.value); }
  }
  const where = conds.length ? `where ${conds.join(" and ")}` : "";
  const total = (await q1<{ n: number }>(`select count(*)::int as n from ${table} ${where}`, params))?.n ?? 0;
  const orderCol = colRef(resource, orderBy);
  const rows = await q(
    `select * from ${table} ${where} order by ${orderCol} ${orderDesc ? "desc" : "asc"} nulls last limit $${i++} offset $${i++}`,
    [...params, limit, offset],
  );
  return { rows, total };
}

// ── Usuários do dashboard ───────────────────────────────────────────────────
export async function getUserByUsername(username: string): Promise<DashUser | null> {
  return q1<DashUser>(`select id, username, password_hash, active, role from dashboard_users where username = $1`, [username]);
}
export async function getUserRole(id: string): Promise<string | null> {
  return (await q1<{ role: string }>(`select role from dashboard_users where id = $1`, [id]))?.role ?? null;
}
export async function countUsers(): Promise<number> {
  return (await q1<{ n: number }>(`select count(*)::int as n from dashboard_users`))?.n ?? 0;
}
export async function createUser(username: string, passwordHash: string, role = "gestor"): Promise<void> {
  await exec(`insert into dashboard_users (username, password_hash, role) values ($1,$2,$3)`, [username, passwordHash, role]);
}
export async function listUsers(): Promise<{ id: string; username: string; role: string; active: boolean; created_at: string; last_login_at: string | null }[]> {
  return q(`select id, username, role, active, created_at, last_login_at from dashboard_users order by created_at`);
}
export async function deleteUser(id: string): Promise<void> {
  await exec(`delete from dashboard_users where id = $1`, [id]);
}
export async function touchUserLogin(id: string): Promise<void> {
  await exec(`update dashboard_users set last_login_at = now() where id = $1`, [id]);
}
export async function ensureSeedUser(): Promise<void> {
  const user = config.defaultDashUser();
  const pass = config.defaultDashPassword();
  if (!user || !pass) return;
  if ((await countUsers()) > 0) return;
  try { await createUser(user, hashPassword(pass), "admin"); } catch { /* corrida */ }
}

// ── Sync runs + estatísticas ────────────────────────────────────────────────
export async function insertSyncRun(r: Record<string, any>): Promise<void> {
  await exec(
    `insert into sync_runs (client_id, status, is_full, resources_count, ok_count, error_count, total_upserted, started_at, finished_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [r.client_id, r.status, r.is_full ?? false, r.resources_count ?? 0, r.ok_count ?? 0, r.error_count ?? 0, r.total_upserted ?? 0, r.started_at, r.finished_at],
  );
}
export async function listRecentRuns(limit = 20): Promise<any[]> {
  return q(`select id, client_id, status, is_full, resources_count, ok_count, error_count, total_upserted, started_at, finished_at
            from sync_runs order by started_at desc limit $1`, [limit]);
}
export async function allRunsLite(): Promise<{ client_id: string; status: string; started_at: string; total_upserted: number }[]> {
  return q(`select client_id, status, started_at, total_upserted from sync_runs`);
}
export async function perResourceCounts(): Promise<Record<string, number>> {
  const entries = await Promise.all(
    RESOURCE_KEYS.map(async (r) => {
      const n = (await q1<{ n: number }>(`select count(*)::int as n from ${tableFor(r)}`))?.n ?? 0;
      return [r, n] as const;
    }),
  );
  return Object.fromEntries(entries);
}
// Tempo médio de execução dos syncs (ms): geral + por cliente.
export async function syncTimings(): Promise<{ overall_ms: number; by_client: Record<string, number> }> {
  const overall = (await q1<{ ms: number }>(
    `select coalesce(avg(extract(epoch from (finished_at - started_at)) * 1000), 0)::int as ms
     from sync_runs where finished_at is not null`,
  ))?.ms ?? 0;
  const rows = await q<{ client_id: string; ms: number }>(
    `select client_id, avg(extract(epoch from (finished_at - started_at)) * 1000)::int as ms
     from sync_runs where finished_at is not null group by client_id`,
  );
  return { overall_ms: overall, by_client: Object.fromEntries(rows.map((r) => [r.client_id, r.ms])) };
}

export async function tokenCounts(): Promise<{ total: number; active: number }> {
  const total = (await q1<{ n: number }>(`select count(*)::int as n from api_tokens`))?.n ?? 0;
  const active = (await q1<{ n: number }>(`select count(*)::int as n from api_tokens where active`))?.n ?? 0;
  return { total, active };
}

// ── Logs ────────────────────────────────────────────────────────────────────
export async function listSyncLogs(clientId: string | null, limit = 100): Promise<unknown[]> {
  const lim = Math.min(Math.max(limit, 1), 500);
  if (clientId)
    return q(`select id, client_id, resource, status, records_upserted, error, started_at, finished_at
              from opa_sync_logs where client_id=$1 order by started_at desc limit $2`, [clientId, lim]);
  return q(`select id, client_id, resource, status, records_upserted, error, started_at, finished_at
            from opa_sync_logs order by started_at desc limit $1`, [lim]);
}
export async function insertSyncLog(clientId: string, resource: string, status: string, records: number, errorMsg: string | null): Promise<void> {
  await exec(
    `insert into opa_sync_logs (client_id, resource, status, records_upserted, error, finished_at)
     values ($1,$2,$3,$4,$5,now())`,
    [clientId, resource, status, records, errorMsg],
  );
}

// ── Settings (config global do painel) ──────────────────────────────────────
export async function getSettings(): Promise<Record<string, any>> {
  const rows = await q<{ key: string; value: any }>(`select key, value from app_settings`);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
export async function setSetting(key: string, value: unknown): Promise<void> {
  await exec(
    `insert into app_settings (key, value, updated_at) values ($1,$2,now())
     on conflict (key) do update set value=excluded.value, updated_at=now()`,
    [key, jb(value)],
  );
}
