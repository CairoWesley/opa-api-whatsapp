-- ─────────────────────────────────────────────────────────────────────────────
-- opa-api-whatsapp — configurações globais do painel (key/value).
-- Controla o agendador interno: re-sync automático e revalidação de token.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.app_settings (
    key        text primary key,
    value      jsonb not null,
    updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values
    ('auto_resync_enabled',     'true'::jsonb),
    ('auto_revalidate_enabled', 'true'::jsonb),
    ('revalidate_hours',        '12'::jsonb)
on conflict (key) do nothing;

alter table public.app_settings enable row level security;
