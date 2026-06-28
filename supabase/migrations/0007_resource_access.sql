-- ─────────────────────────────────────────────────────────────────────────────
-- opa-api-whatsapp — acesso por recurso (permissões do token da OPA).
--   - blocked_resources: recursos que deram 401/403 e ficam FORA da fila desse
--     cliente até o token ser revalidado/atualizado no painel.
--   - resource_access: último resultado da revalidação por recurso
--     { recurso: { ok: bool, code: int, at: timestamp } }.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.opa_clients
    add column if not exists blocked_resources text[]  not null default '{}',
    add column if not exists resource_access   jsonb    not null default '{}'::jsonb;
