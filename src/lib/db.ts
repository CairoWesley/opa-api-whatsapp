// Conexão DIRETA ao Postgres (driver pg) — sem Kong/PostgREST no caminho.
// Conecta como `postgres` (superuser), então bypassa RLS naturalmente.
import { Pool } from "pg";
import { config } from "./config";

let _pool: Pool | null = null;

export function pool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: config.databaseUrl(),
      max: Number(process.env.PG_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
    });
    _pool.on("error", (e) => console.error("[pg] pool error:", e.message));
  }
  return _pool;
}

export async function q<T = any>(sql: string, params?: unknown[]): Promise<T[]> {
  const r = await pool().query(sql, params as any[]);
  return r.rows as T[];
}

export async function q1<T = any>(sql: string, params?: unknown[]): Promise<T | null> {
  const r = await pool().query(sql, params as any[]);
  return (r.rows[0] as T) ?? null;
}

export async function exec(sql: string, params?: unknown[]): Promise<number> {
  const r = await pool().query(sql, params as any[]);
  return r.rowCount ?? 0;
}

// Roda uma query em transação READ ONLY (qualquer escrita falha) + timeout.
// Para o testador de query do painel. Retorna colunas, linhas e tempo.
export async function readOnlyQuery(sql: string, limit = 200): Promise<{ columns: string[]; rows: any[]; rowCount: number; ms: number }> {
  const client = await pool().connect();
  try {
    await client.query("begin transaction read only");
    await client.query("set local statement_timeout = 8000");
    const t0 = Date.now();
    const r = await client.query(sql);
    const ms = Date.now() - t0;
    await client.query("rollback");
    const rows = (r.rows as any[]).slice(0, limit);
    const columns = r.fields?.map((f) => f.name) ?? (rows[0] ? Object.keys(rows[0]) : []);
    return { columns, rows, rowCount: r.rowCount ?? rows.length, ms };
  } catch (e) {
    try { await client.query("rollback"); } catch { /* noop */ }
    throw e;
  } finally {
    client.release();
  }
}
