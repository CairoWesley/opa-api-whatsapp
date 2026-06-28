-- ─────────────────────────────────────────────────────────────────────────────
-- opa-api-whatsapp — índices de performance para a read API (filtros + ordenação).
--
-- A read API ordena por synced_at e filtra por (client_id, resource) + campos do
-- raw jsonb. Estes índices cobrem os caminhos quentes. Índices de expressão em
-- campos do raw aceleram `raw->>'campo' = valor` (o GIN do 0001 não cobre isso).
-- ─────────────────────────────────────────────────────────────────────────────

-- Ordenação/paginação por cliente + recurso (caminho mais comum da read API).
create index if not exists idx_documents_client_resource_synced
    on public.opa_documents (client_id, resource, synced_at desc);

-- Mesma coisa sem cliente (consulta "todos os clientes" de um recurso).
create index if not exists idx_documents_resource_synced
    on public.opa_documents (resource, synced_at desc);

-- Índices de expressão p/ os campos mais filtrados (achatados nas views).
-- Atendimentos:
create index if not exists idx_doc_protocolo    on public.opa_documents ((raw->>'protocolo'));
create index if not exists idx_doc_status        on public.opa_documents ((raw->>'status'));
create index if not exists idx_doc_departamento on public.opa_documents ((raw->>'departamento'));
-- Contatos:
create index if not exists idx_doc_telefone     on public.opa_documents ((raw->>'telefone'));
create index if not exists idx_doc_email        on public.opa_documents ((raw->>'email'));
-- Mensagens:
create index if not exists idx_doc_atendimento  on public.opa_documents ((raw->>'atendimento'));
