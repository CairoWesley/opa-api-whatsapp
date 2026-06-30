-- Log das requisições à API do cliente (status + body de retorno), retenção 60d.
create table if not exists opa_api_logs (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  method text,
  path text,
  query text,
  status int,
  client_id uuid,
  token_id uuid,
  principal text,
  duration_ms int,
  response_body text,
  created_at timestamptz not null default now()
);
create index if not exists idx_api_logs_ts on opa_api_logs (ts desc);
create index if not exists idx_api_logs_client on opa_api_logs (client_id, ts desc);

-- Performance: filtros/ordenacao por data + cliente em atendimentos (Power BI).
-- Sem isto, filtro aberto_em + offset faz scan+sort de milhoes de linhas → timeout/500.
create index if not exists idx_atend_client_aberto on opa_atendimentos (client_id, aberto_em);
create index if not exists idx_atend_aberto on opa_atendimentos (aberto_em);
create index if not exists idx_atend_encerrado on opa_atendimentos (encerrado_em);
create index if not exists idx_atend_synced on opa_atendimentos (synced_at desc);
