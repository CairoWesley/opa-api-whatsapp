-- ─────────────────────────────────────────────────────────────────────────────
-- opa-api-whatsapp — usuários do DASHBOARD (login usuário/senha).
--
-- O acesso PROGRAMÁTICO à API continua por token (APP_ADMIN_TOKEN, Bearer).
-- O DASHBOARD gerencial passa a usar login + senha → cookie de sessão assinado.
-- Senha guardada como hash scrypt (scrypt$<salt>$<hash>); nunca em claro.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.dashboard_users (
    id             uuid primary key default gen_random_uuid(),
    username       text not null unique,
    password_hash  text not null,                 -- scrypt$<saltB64>$<hashB64>
    active         boolean not null default true,
    last_login_at  timestamptz,
    created_at     timestamptz not null default now()
);

-- RLS ligado sem policies: anon key não enxerga; backend usa service role.
alter table public.dashboard_users enable row level security;
