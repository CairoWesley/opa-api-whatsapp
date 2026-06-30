-- ─────────────────────────────────────────────────────────────────────────────
-- opa-api-whatsapp — histórico de SYNCS (1 linha por execução de syncClient).
-- opa_sync_logs guarda por RECURSO; sync_runs guarda por EXECUÇÃO (run),
-- p/ contar "quantos syncs por cliente" e relatório mensal.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.sync_runs (
    id               uuid primary key default gen_random_uuid(),
    client_id        uuid references public.opa_clients(id) on delete cascade,
    status           text not null,                 -- ok | error
    is_full          boolean not null default false,
    resources_count  integer not null default 0,
    ok_count         integer not null default 0,
    error_count      integer not null default 0,
    total_upserted   integer not null default 0,
    started_at       timestamptz not null default now(),
    finished_at      timestamptz
);

create index if not exists idx_sync_runs_client on public.sync_runs (client_id, started_at desc);
create index if not exists idx_sync_runs_started on public.sync_runs (started_at desc);

alter table public.sync_runs enable row level security;

-- Motivo do erro por execução (mostrado na tabela EXECUÇÕES do painel).
alter table public.sync_runs add column if not exists error text;
