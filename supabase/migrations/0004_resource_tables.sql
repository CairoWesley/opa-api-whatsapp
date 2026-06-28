-- ─────────────────────────────────────────────────────────────────────────────
-- opa-api-whatsapp — UMA TABELA POR RECURSO (separação física).
--
-- Cada recurso tem sua tabela `opa_<recurso>` com:
--   - colunas comuns TIPADAS (campos padrão extraídos de qualquer versão da OPA)
--   - `raw jsonb` com o documento inteiro (o que não foi promovido a coluna)
-- Chave de upsert: unique(client_id, external_id).
--
-- O app preenche as colunas tipadas via COALESCE de nomes prováveis (mappers.ts).
-- ─────────────────────────────────────────────────────────────────────────────

-- Colunas base comuns a todas as tabelas de recurso.
-- (repetidas em cada CREATE para clareza)

-- ── etiquetas ───────────────────────────────────────────────────────────────
create table if not exists public.opa_etiquetas (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null references public.opa_clients(id) on delete cascade,
    external_id text not null,
    nome text,
    raw jsonb not null,
    synced_at timestamptz not null default now(),
    unique (client_id, external_id)
);

-- ── usuarios ────────────────────────────────────────────────────────────────
create table if not exists public.opa_usuarios (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null references public.opa_clients(id) on delete cascade,
    external_id text not null,
    nome text, status text, tipo text,
    raw jsonb not null,
    synced_at timestamptz not null default now(),
    unique (client_id, external_id)
);

-- ── departamentos ───────────────────────────────────────────────────────────
create table if not exists public.opa_departamentos (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null references public.opa_clients(id) on delete cascade,
    external_id text not null,
    nome text,
    raw jsonb not null,
    synced_at timestamptz not null default now(),
    unique (client_id, external_id)
);

-- ── motivos ─────────────────────────────────────────────────────────────────
create table if not exists public.opa_motivos (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null references public.opa_clients(id) on delete cascade,
    external_id text not null,
    motivo text,
    raw jsonb not null,
    synced_at timestamptz not null default now(),
    unique (client_id, external_id)
);

-- ── canais ──────────────────────────────────────────────────────────────────
create table if not exists public.opa_canais (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null references public.opa_clients(id) on delete cascade,
    external_id text not null,
    nome text, status text, canal text,
    raw jsonb not null,
    synced_at timestamptz not null default now(),
    unique (client_id, external_id)
);

-- ── templates ───────────────────────────────────────────────────────────────
create table if not exists public.opa_templates (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null references public.opa_clients(id) on delete cascade,
    external_id text not null,
    atalho text, tipo_mensagem text,
    raw jsonb not null,
    synced_at timestamptz not null default now(),
    unique (client_id, external_id)
);

-- ── clientes (da OPA) ───────────────────────────────────────────────────────
create table if not exists public.opa_clientes (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null references public.opa_clients(id) on delete cascade,
    external_id text not null,
    nome text, fantasia text, cpf_cnpj text, status text,
    raw jsonb not null,
    synced_at timestamptz not null default now(),
    unique (client_id, external_id)
);

-- ── contatos ────────────────────────────────────────────────────────────────
create table if not exists public.opa_contatos (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null references public.opa_clients(id) on delete cascade,
    external_id text not null,
    nome text, telefone text, email text,
    raw jsonb not null,
    synced_at timestamptz not null default now(),
    unique (client_id, external_id)
);

-- ── periodos ────────────────────────────────────────────────────────────────
create table if not exists public.opa_periodos (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null references public.opa_clients(id) on delete cascade,
    external_id text not null,
    nome text, ativo text,
    raw jsonb not null,
    synced_at timestamptz not null default now(),
    unique (client_id, external_id)
);

-- ── atendimentos (fato principal) ───────────────────────────────────────────
create table if not exists public.opa_atendimentos (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null references public.opa_clients(id) on delete cascade,
    external_id text not null,
    protocolo text, status text, departamento text, canal text,
    contato_id text, avaliacao text,
    aberto_em timestamptz, encerrado_em timestamptz,
    raw jsonb not null,
    synced_at timestamptz not null default now(),
    unique (client_id, external_id)
);

-- ── mensagens ───────────────────────────────────────────────────────────────
create table if not exists public.opa_mensagens (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null references public.opa_clients(id) on delete cascade,
    external_id text not null,
    atendimento_id text, tipo text, conteudo text, enviado_em timestamptz,
    raw jsonb not null,
    synced_at timestamptz not null default now(),
    unique (client_id, external_id)
);

-- ── Índices comuns (client+synced p/ paginação, gin no raw) ──────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'opa_etiquetas','opa_usuarios','opa_departamentos','opa_motivos','opa_canais',
    'opa_templates','opa_clientes','opa_contatos','opa_periodos','opa_atendimentos','opa_mensagens'
  ] loop
    execute format('create index if not exists %I on public.%I (client_id, synced_at desc)', 'idx_'||t||'_client_synced', t);
    execute format('create index if not exists %I on public.%I using gin (raw)', 'idx_'||t||'_raw_gin', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Índices específicos dos campos quentes:
create index if not exists idx_atend_status       on public.opa_atendimentos (status);
create index if not exists idx_atend_protocolo    on public.opa_atendimentos (protocolo);
create index if not exists idx_atend_departamento on public.opa_atendimentos (departamento);
create index if not exists idx_atend_aberto       on public.opa_atendimentos (aberto_em desc);
create index if not exists idx_atend_encerrado    on public.opa_atendimentos (encerrado_em desc);
create index if not exists idx_contato_telefone   on public.opa_contatos (telefone);
create index if not exists idx_contato_email      on public.opa_contatos (email);
create index if not exists idx_msg_atendimento    on public.opa_mensagens (atendimento_id);
create index if not exists idx_msg_enviado        on public.opa_mensagens (enviado_em desc);

-- ── Views p/ Power BI (agora a partir das tabelas tipadas) ───────────────────
create or replace view public.vw_atendimentos as
select a.id, c.slug as client_slug, c.name as client_name, a.external_id,
       a.protocolo, a.status, a.departamento, a.canal, a.contato_id, a.avaliacao,
       a.aberto_em, a.encerrado_em, a.synced_at, a.raw
from public.opa_atendimentos a join public.opa_clients c on c.id = a.client_id;

create or replace view public.vw_contatos as
select x.id, c.slug as client_slug, c.name as client_name, x.external_id,
       x.nome, x.telefone, x.email, x.synced_at, x.raw
from public.opa_contatos x join public.opa_clients c on c.id = x.client_id;

create or replace view public.vw_mensagens as
select m.id, c.slug as client_slug, c.name as client_name, m.external_id,
       m.atendimento_id, m.tipo, m.conteudo, m.enviado_em, m.synced_at, m.raw
from public.opa_mensagens m join public.opa_clients c on c.id = m.client_id;
