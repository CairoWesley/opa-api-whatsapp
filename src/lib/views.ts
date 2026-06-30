// Views SQL entregues ao cliente via token. Admin define uma SELECT sobre as
// tabelas extraídas; cria-se um objeto no Postgres (VIEW normal ou MATERIALIZED).
// O cliente consome em /api/views/{slug} — SEMPRE escopado por client_id (o
// token define o cliente). Materialized é atualizada por cron (scheduler).
import { q, q1, exec } from "./db";

export type ViewDef = {
  id: string;
  slug: string;
  name: string;
  sql: string;
  materialized: boolean;
  refresh_interval_minutes: number;
  enabled: boolean;
  // Dono: se setado, SÓ o token desse cliente (ou admin) acessa a view.
  // null = compartilhada (qualquer cliente; escopada por linha via client_id).
  client_id: string | null;
  // A view expõe coluna client_id? (p/ filtrar linhas por token).
  has_client_id: boolean;
  last_refreshed_at: string | null;
  last_error: string | null;
  created_at: string;
};

export const SLUG_RE = /^[a-z][a-z0-9_]{1,48}$/;
// Nome do objeto no banco. slug validado por SLUG_RE → seguro interpolar.
const objName = (slug: string) => `opa_view_${slug}`;

let ensured = false;
export async function ensureViewsTable(): Promise<void> {
  if (ensured) return;
  await exec(`create table if not exists opa_views (
    id uuid primary key default gen_random_uuid(),
    slug text unique not null,
    name text not null,
    sql text not null,
    materialized boolean not null default false,
    refresh_interval_minutes int not null default 60,
    enabled boolean not null default true,
    last_refreshed_at timestamptz,
    last_error text,
    created_at timestamptz not null default now()
  )`);
  // Colunas de dono/escopo (idempotente p/ bases já criadas).
  await exec(`alter table opa_views add column if not exists client_id uuid`);
  await exec(`alter table opa_views add column if not exists has_client_id boolean not null default true`);
  ensured = true;
}

export async function listViews(): Promise<ViewDef[]> {
  await ensureViewsTable();
  return q<ViewDef>(`select * from opa_views order by created_at desc`);
}

export async function getView(slug: string): Promise<ViewDef | null> {
  await ensureViewsTable();
  return q1<ViewDef>(`select * from opa_views where slug = $1`, [slug]);
}

// Confere se o objeto criado expõe a coluna client_id (necessária p/ escopar).
async function hasClientId(obj: string): Promise<boolean> {
  const rows = await q<{ attname: string }>(
    `select attname from pg_attribute where attrelid = $1::regclass and attnum > 0 and not attisdropped`,
    [obj],
  );
  return rows.some((r) => r.attname === "client_id");
}

export type ViewInput = {
  slug: string;
  name: string;
  sql: string;
  materialized: boolean;
  refresh_interval_minutes?: number;
  client_id?: string | null; // dono (opcional)
};

// Cria/substitui o objeto no banco + grava a definição.
//   - view COMPARTILHADA (sem dono): SELECT precisa expor client_id (escopo por linha).
//   - view DO CLIENTE (com dono): só ele acessa; client_id na SELECT é opcional.
export async function upsertView(input: ViewInput): Promise<ViewDef> {
  await ensureViewsTable();
  if (!SLUG_RE.test(input.slug)) throw new Error("slug inválido (a-z, 0-9, _; começa com letra)");
  const sql = input.sql.trim().replace(/;\s*$/, "");
  if (!/^select\s/i.test(sql)) throw new Error("a SQL da view precisa começar com SELECT");
  const owner = input.client_id || null;
  const obj = objName(input.slug);

  // Troca de tipo limpa: remove qualquer objeto anterior com esse nome.
  await exec(`drop materialized view if exists ${obj} cascade`);
  await exec(`drop view if exists ${obj} cascade`);

  try {
    if (input.materialized) await exec(`create materialized view ${obj} as ${sql}`);
    else await exec(`create view ${obj} as ${sql}`);
  } catch (e) {
    throw new Error(`SQL inválida: ${e instanceof Error ? e.message : e}`);
  }

  const hasCid = await hasClientId(obj);
  // Compartilhada exige client_id (senão não dá p/ escopar por cliente).
  if (!owner && !hasCid) {
    await exec(`drop materialized view if exists ${obj} cascade`);
    await exec(`drop view if exists ${obj} cascade`);
    throw new Error("view compartilhada: a SELECT precisa expor client_id (ou defina um cliente dono)");
  }

  const interval = Math.max(Number(input.refresh_interval_minutes ?? 60), 1);
  const row = await q1<ViewDef>(
    `insert into opa_views (slug, name, sql, materialized, refresh_interval_minutes, enabled, client_id, has_client_id, last_error)
     values ($1,$2,$3,$4,$5,true,$6,$7,null)
     on conflict (slug) do update set
       name = excluded.name, sql = excluded.sql, materialized = excluded.materialized,
       refresh_interval_minutes = excluded.refresh_interval_minutes, enabled = true,
       client_id = excluded.client_id, has_client_id = excluded.has_client_id, last_error = null
     returning *`,
    [input.slug, input.name, sql, input.materialized, interval, owner, hasCid],
  );
  if (input.materialized) await refreshView(input.slug).catch(() => {});
  return row as ViewDef;
}

export async function deleteView(slug: string): Promise<void> {
  await ensureViewsTable();
  const obj = objName(slug);
  await exec(`drop materialized view if exists ${obj} cascade`);
  await exec(`drop view if exists ${obj} cascade`);
  await exec(`delete from opa_views where slug = $1`, [slug]);
}

// Atualiza uma materialized view (no-op p/ view normal). Carimba last_refreshed_at.
export async function refreshView(slug: string): Promise<void> {
  const v = await getView(slug);
  if (!v) throw new Error("view não encontrada");
  if (!v.materialized) return;
  const obj = objName(slug);
  try {
    await exec(`refresh materialized view ${obj}`);
    await exec(`update opa_views set last_refreshed_at = now(), last_error = null where slug = $1`, [slug]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await exec(`update opa_views set last_error = $2 where slug = $1`, [slug, msg]).catch(() => {});
    throw e;
  }
}

// Cron/scheduler: atualiza as materialized cujo intervalo venceu. Retorna slugs.
export async function refreshDueViews(): Promise<string[]> {
  await ensureViewsTable();
  const rows = await q<ViewDef>(
    `select * from opa_views where materialized and enabled`,
  );
  const now = Date.now();
  const done: string[] = [];
  for (const v of rows) {
    const last = v.last_refreshed_at ? Date.parse(v.last_refreshed_at) : 0;
    if (!last || now - last >= (v.refresh_interval_minutes || 60) * 60_000) {
      await refreshView(v.slug).catch(() => {});
      done.push(v.slug);
    }
  }
  return done;
}

// Lê a view escopada pelo cliente (client_id do token). Paginada.
export async function queryView(
  slug: string,
  clientId: string | null,
  limit: number,
  offset: number,
): Promise<{ rows: any[]; total: number }> {
  const v = await getView(slug);
  if (!v || !v.enabled) throw new Error("view não encontrada");
  const obj = objName(slug);
  // Só filtra por linha se a view EXPÕE client_id e há um escopo definido.
  const scoped = v.has_client_id && clientId;
  const where = scoped ? `where client_id = $1` : ``;
  const params = scoped ? [clientId] : [];
  const totalRow = await q1<{ n: number }>(`select count(*)::int n from ${obj} ${where}`, params);
  const rows = await q(`select * from ${obj} ${where} limit ${limit} offset ${offset}`, params);
  return { rows, total: totalRow?.n ?? 0 };
}
