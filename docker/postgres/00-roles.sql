-- Roles que o PostgREST usa (executado no init do Postgres, antes da migração).
-- O PostgREST conecta como `postgres` (superuser) e faz SET ROLE para a role do JWT.
-- service_role tem BYPASSRLS para enxergar as tabelas com RLS habilitado.
do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;
