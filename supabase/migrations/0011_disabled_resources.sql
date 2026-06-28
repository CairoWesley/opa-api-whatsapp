-- ─────────────────────────────────────────────────────────────────────────────
-- opa-api-whatsapp — recursos DESABILITADOS manualmente por cliente.
-- Diferente de blocked_resources (automático por 401/403): aqui o admin escolhe
-- não sincronizar uma rota (ex: não quero `templates` desse cliente).
-- O extractor pula esses recursos sempre.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.opa_clients
    add column if not exists disabled_resources text[] not null default '{}';
