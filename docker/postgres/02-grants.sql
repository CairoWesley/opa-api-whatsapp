-- Privilégios de tabela para service_role (executado após a migração 01-init.sql).
-- service_role já tem BYPASSRLS; estes grants liberam SELECT/INSERT/UPDATE/DELETE.
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all routines  in schema public to service_role;

-- Objetos criados futuramente também herdam os privilégios.
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
