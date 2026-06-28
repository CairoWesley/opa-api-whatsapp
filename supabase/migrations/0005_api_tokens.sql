-- ─────────────────────────────────────────────────────────────────────────────
-- opa-api-whatsapp — tokens de acesso à API do CLIENTE (gerenciáveis no painel).
--
-- Vários tokens, cada um com nome/escopo. Guardamos só o HASH (sha256) + um
-- prefixo p/ exibição. O valor em claro só aparece UMA vez, na geração.
-- A API do cliente aceita: Bearer <token>, Basic (token como senha) ou o
-- APP_ADMIN_TOKEN (acesso total).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.api_tokens (
    id            uuid primary key default gen_random_uuid(),
    name          text not null,
    token_prefix  text not null,                  -- ex: opa_ab12cd  (exibição)
    token_hash    text not null unique,           -- sha256(token) hex
    scopes        text[] not null default array['data:read'],
    active        boolean not null default true,
    created_at    timestamptz not null default now(),
    last_used_at  timestamptz
);

create index if not exists idx_api_tokens_hash on public.api_tokens (token_hash);

alter table public.api_tokens enable row level security;
