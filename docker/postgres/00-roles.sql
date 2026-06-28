-- Roles que o PostgREST usa (executado no init do Postgres, antes da migração).
-- O PostgREST conecta como `postgres` (superuser) e faz SET ROLE para a role do JWT.
-- service_role tem BYPASSRLS para enxergar as tabelas com RLS habilitado.
do $$
begin
  -- A imagem supabase/postgres tem event triggers de DDL que referenciam
  -- supabase_admin. Num cluster initdb cru (POSTGRES_PASSWORD) essa role não
  -- existe, então CREATE EXTENSION falha. Cria antes da migração.
  if not exists (select from pg_roles where rolname = 'supabase_admin') then
    create role supabase_admin login superuser createrole createdb replication bypassrls;
  end if;
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
