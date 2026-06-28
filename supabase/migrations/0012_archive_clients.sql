-- ─────────────────────────────────────────────────────────────────────────────
-- opa-api-whatsapp — ARQUIVAR clientes (soft delete) em vez de excluir.
-- Mantém o histórico (sync_runs, logs, dados). Arquivado some das listas e
-- não sincroniza, mas os dados ficam para relatório.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.opa_clients
    add column if not exists archived boolean not null default false;

create index if not exists idx_opa_clients_archived on public.opa_clients (archived);
