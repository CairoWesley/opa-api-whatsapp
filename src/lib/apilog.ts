// Log das requisições à API do cliente (rotas withApiAuth): método, rota,
// query, status, body de retorno (truncado), cliente/token, duração. Retenção
// configurável (default 60 dias) — purgada pelo scheduler.
import { q, q1, exec } from "./db";
import { config } from "./config";

let ensured = false;
export async function ensureApiLogTable(): Promise<void> {
  if (ensured) return;
  await exec(`create table if not exists opa_api_logs (
    id uuid primary key default gen_random_uuid(),
    ts timestamptz not null default now(),
    method text,
    path text,
    query text,
    status int,
    client_id uuid,
    token_id uuid,
    principal text,
    duration_ms int,
    response_body text,
    created_at timestamptz not null default now()
  )`);
  await exec(`create index if not exists idx_api_logs_ts on opa_api_logs (ts desc)`);
  await exec(`create index if not exists idx_api_logs_client on opa_api_logs (client_id, ts desc)`);
  ensured = true;
}

export type ApiLogEntry = {
  method: string;
  path: string;
  query: string | null;
  status: number;
  client_id: string | null;
  token_id: string | null;
  principal: string;
  duration_ms: number;
  response_body: string | null;
};

// Grava 1 entrada. Best-effort: nunca derruba a request.
export async function insertApiLog(e: ApiLogEntry): Promise<void> {
  try {
    await ensureApiLogTable();
    await exec(
      `insert into opa_api_logs (method, path, query, status, client_id, token_id, principal, duration_ms, response_body)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [e.method, e.path, e.query, e.status, e.client_id, e.token_id, e.principal, e.duration_ms, e.response_body],
    );
  } catch {
    /* silencioso */
  }
}

// Remove logs além da retenção (default 60 dias). Retorna nº removido.
export async function purgeApiLogs(): Promise<number> {
  try {
    await ensureApiLogTable();
    const days = config.apiLogRetentionDays();
    return await exec(`delete from opa_api_logs where ts < now() - ($1 || ' days')::interval`, [String(days)]);
  } catch {
    return 0;
  }
}

export async function listApiLogs(opts: { clientId?: string | null; status?: number | null; limit?: number }): Promise<any[]> {
  await ensureApiLogTable();
  const conds: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (opts.clientId) { conds.push(`client_id = $${i++}`); params.push(opts.clientId); }
  if (opts.status) { conds.push(`status = $${i++}`); params.push(opts.status); }
  const where = conds.length ? `where ${conds.join(" and ")}` : "";
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 1000);
  return q(`select id, ts, method, path, query, status, client_id, token_id, principal, duration_ms,
                   left(response_body, 2000) as response_body
            from opa_api_logs ${where} order by ts desc limit ${limit}`, params);
}
