-- ─────────────────────────────────────────────────────────────────────────────
-- opa-api-whatsapp — configs por cliente + token POR CLIENTE.
--   - opa_clients ganha page_size / timeout_ms (override dos defaults de env).
--   - api_tokens ganha client_id: o token passa a ser escopo de UM cliente
--     (só lê os dados daquele cliente). client_id nulo = token global (admin).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.opa_clients
    add column if not exists page_size  integer,   -- take da paginação (skip/limit) na OPA
    add column if not exists timeout_ms integer;   -- timeout das chamadas à OPA

alter table public.api_tokens
    add column if not exists client_id uuid references public.opa_clients(id) on delete cascade;

create index if not exists idx_api_tokens_client on public.api_tokens (client_id);
