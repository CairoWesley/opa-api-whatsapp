-- ─────────────────────────────────────────────────────────────────────────────
-- opa-api-whatsapp — papéis de usuário do dashboard.
--   admin  → tudo, inclusive config global do agendador e gestão de usuários
--   gestor → tudo EXCETO config de funcionamento dos syncs e gestão de usuários
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.dashboard_users
    add column if not exists role text not null default 'gestor';

-- Usuários que já existiam (antes dos papéis) viram admin.
update public.dashboard_users set role = 'admin' where role is null or role = '';
update public.dashboard_users set role = 'admin'
 where id in (select id from public.dashboard_users order by created_at limit 1);
