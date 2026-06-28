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
