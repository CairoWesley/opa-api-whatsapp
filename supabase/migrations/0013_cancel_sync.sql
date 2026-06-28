-- ─────────────────────────────────────────────────────────────────────────────
-- opa-api-whatsapp — kill switch do sync.
-- cancel_requested: quando true, o worker aborta o sync desse cliente no próximo
-- checkpoint (entre recursos / entre lotes). É limpo ao iniciar/terminar.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.opa_clients
    add column if not exists cancel_requested boolean not null default false;
