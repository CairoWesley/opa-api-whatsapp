-- ─────────────────────────────────────────────────────────────────────────────
-- opa-api-whatsapp — schema base (Supabase / Postgres)
--
-- Multi-client: cada `opa_client` é um tenant da OPA Suite (base_url + token).
-- Os dados extraídos NÃO ficam mais numa tabela única — cada recurso tem a sua
-- própria tabela com campos comuns tipados + raw jsonb (ver 0004).
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ── Registro de clientes (tenants OPA Suite) ────────────────────────────────
create table if not exists public.opa_clients (
    id                     uuid primary key default gen_random_uuid(),
    slug                   text not null unique,
    name                   text not null,
    base_url               text not null,
    token_encrypted        text not null,                   -- token OPA criptografado (AES-256-GCM)
    company_id             text,
    active                 boolean not null default true,
    insecure_tls           boolean not null default false,  -- ignora verificação de cert TLS da OPA
    sync_interval_minutes  integer not null default 30,
    lookback_days          integer not null default 30,
    extra_filters          jsonb not null default '{}'::jsonb,
    last_synced_at         timestamptz,
    last_sync_status       text,                            -- ok | error | running | queued | null
    last_sync_error        text,
    created_at             timestamptz not null default now(),
    updated_at             timestamptz not null default now()
);

create index if not exists idx_opa_clients_active on public.opa_clients (active);

-- ── Log de sincronizações ───────────────────────────────────────────────────
create table if not exists public.opa_sync_logs (
    id                uuid primary key default gen_random_uuid(),
    client_id         uuid references public.opa_clients (id) on delete cascade,
    resource          text not null,
    status            text not null,
    records_upserted  integer not null default 0,
    error             text,
    started_at        timestamptz not null default now(),
    finished_at       timestamptz
);

create index if not exists idx_sync_logs_client on public.opa_sync_logs (client_id, started_at desc);

-- ── updated_at automático em opa_clients ────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_opa_clients_updated_at on public.opa_clients;
create trigger trg_opa_clients_updated_at
    before update on public.opa_clients
    for each row execute function public.set_updated_at();

-- RLS: backend usa service role (bypassa). Ligado sem policies = anon não lê.
alter table public.opa_clients   enable row level security;
alter table public.opa_sync_logs enable row level security;
