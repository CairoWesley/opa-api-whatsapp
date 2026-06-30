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

-- Performance: índices nas colunas de FILTRO de cada tabela (Power BI/API).
-- (Em base já populada, criados pelo worker via CONCURRENTLY — ver src/lib/indexes.ts.)
create index if not exists idx_atend_client_synced on opa_atendimentos (client_id, synced_at desc);
create index if not exists idx_atend_client_aberto on opa_atendimentos (client_id, aberto_em);
create index if not exists idx_atend_aberto on opa_atendimentos (aberto_em);
create index if not exists idx_atend_encerrado on opa_atendimentos (encerrado_em);
create index if not exists idx_atend_status on opa_atendimentos (client_id, status);
create index if not exists idx_atend_protocolo on opa_atendimentos (client_id, protocolo);
create index if not exists idx_atend_departamento on opa_atendimentos (client_id, departamento);
create index if not exists idx_atend_canal on opa_atendimentos (client_id, canal);
create index if not exists idx_atend_contato on opa_atendimentos (client_id, contato_id);
create index if not exists idx_atend_avaliacao on opa_atendimentos (client_id, avaliacao);
create index if not exists idx_msg_client_synced on opa_mensagens (client_id, synced_at desc);
create index if not exists idx_msg_client_atend on opa_mensagens (client_id, atendimento_id);
create index if not exists idx_msg_atend on opa_mensagens (atendimento_id);
create index if not exists idx_msg_tipo on opa_mensagens (client_id, tipo);
create index if not exists idx_msg_enviado on opa_mensagens (enviado_em);
create index if not exists idx_etiq_nome on opa_etiquetas (client_id, nome);
create index if not exists idx_usu_nome on opa_usuarios (client_id, nome);
create index if not exists idx_usu_status on opa_usuarios (client_id, status);
create index if not exists idx_usu_tipo on opa_usuarios (client_id, tipo);
create index if not exists idx_dep_nome on opa_departamentos (client_id, nome);
create index if not exists idx_mot_motivo on opa_motivos (client_id, motivo);
create index if not exists idx_can_nome on opa_canais (client_id, nome);
create index if not exists idx_can_status on opa_canais (client_id, status);
create index if not exists idx_can_canal on opa_canais (client_id, canal);
create index if not exists idx_tpl_atalho on opa_templates (client_id, atalho);
create index if not exists idx_tpl_tipo on opa_templates (client_id, tipo_mensagem);
create index if not exists idx_cli_nome on opa_clientes (client_id, nome);
create index if not exists idx_cli_fantasia on opa_clientes (client_id, fantasia);
create index if not exists idx_cli_cnpj on opa_clientes (client_id, cpf_cnpj);
create index if not exists idx_cli_status on opa_clientes (client_id, status);
create index if not exists idx_cont_nome on opa_contatos (client_id, nome);
create index if not exists idx_cont_fone on opa_contatos (client_id, telefone);
create index if not exists idx_cont_email on opa_contatos (client_id, email);
create index if not exists idx_per_nome on opa_periodos (client_id, nome);
create index if not exists idx_per_ativo on opa_periodos (client_id, ativo);
