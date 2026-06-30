-- Views SQL entregues ao cliente via token (normal + materialized).
-- O objeto real (opa_view_<slug>) é criado/dropado pela app (src/lib/views.ts);
-- aqui fica só o catálogo das definições.
create table if not exists opa_views (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  sql text not null,
  materialized boolean not null default false,
  refresh_interval_minutes int not null default 60,
  enabled boolean not null default true,
  -- dono: se setado, só o token desse cliente acessa a view (null = compartilhada).
  client_id uuid,
  -- a SELECT expõe coluna client_id? (p/ filtrar linhas por token na compartilhada).
  has_client_id boolean not null default true,
  last_refreshed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
