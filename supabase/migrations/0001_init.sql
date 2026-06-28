-- ─────────────────────────────────────────────────────────────────────────────
-- opa-api-whatsapp — schema inicial (Supabase / Postgres)
--
-- Como aplicar:
--   1) Supabase Studio > SQL Editor > cole e rode este arquivo; ou
--   2) supabase db push (CLI), com este arquivo em supabase/migrations/
--
-- Modelo: multi-client. Cada `opa_client` é um tenant da OPA Suite
-- (base_url + token próprios — equivale ao `companyId` da DAG antiga).
-- Os documentos são gravados em `opa_documents` (raw jsonb), particionados por
-- (client_id, resource), espelhando o modelo schema-less do MongoDB de origem.
-- Views tipadas no fim do arquivo achatam os campos para Power BI / BI.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ── Registro de clientes (tenants OPA Suite) ────────────────────────────────
create table if not exists public.opa_clients (
    id                     uuid primary key default gen_random_uuid(),
    slug                   text not null unique,            -- identificador curto e estável
    name                   text not null,
    base_url               text not null,                  -- ex: https://empresa.opasuite.net.br
    token_encrypted        text not null,                  -- token OPA criptografado (Fernet)
    company_id             text,                            -- companyId OPA (rastreabilidade, opcional)
    active                 boolean not null default true,
    sync_interval_minutes  integer not null default 30,
    lookback_days          integer not null default 30,     -- janela de dataInicialAbertura
    extra_filters          jsonb not null default '{}'::jsonb, -- filtros adicionais por recurso
    last_synced_at         timestamptz,
    last_sync_status       text,                            -- ok | error | running | null
    last_sync_error        text,
    created_at             timestamptz not null default now(),
    updated_at             timestamptz not null default now()
);

create index if not exists idx_opa_clients_active on public.opa_clients (active);

-- ── Documentos extraídos (genérico, raw jsonb) ──────────────────────────────
-- resource ∈ {etiquetas, usuarios, departamentos, motivos, canais, templates,
--             clientes, contatos, periodos, atendimentos, mensagens}
create table if not exists public.opa_documents (
    id           uuid primary key default gen_random_uuid(),
    client_id    uuid not null references public.opa_clients (id) on delete cascade,
    resource     text not null,
    external_id  text not null,                            -- _id do documento na OPA
    raw          jsonb not null,
    synced_at    timestamptz not null default now(),
    unique (client_id, resource, external_id)
);

create index if not exists idx_documents_client_resource
    on public.opa_documents (client_id, resource);
create index if not exists idx_documents_raw_gin
    on public.opa_documents using gin (raw);

-- ── Log de sincronizações ───────────────────────────────────────────────────
create table if not exists public.opa_sync_logs (
    id                uuid primary key default gen_random_uuid(),
    client_id         uuid references public.opa_clients (id) on delete cascade,
    resource          text not null,
    status            text not null,                       -- ok | error
    records_upserted  integer not null default 0,
    error             text,
    started_at        timestamptz not null default now(),
    finished_at       timestamptz
);

create index if not exists idx_sync_logs_client on public.opa_sync_logs (client_id, started_at desc);

-- ── updated_at automático em opa_clients ────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_opa_clients_updated_at on public.opa_clients;
create trigger trg_opa_clients_updated_at
    before update on public.opa_clients
    for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Views tipadas para consumo analítico / Power BI.
-- Extraem campos comuns do raw com COALESCE sobre nomes prováveis (PT/EN), e
-- sempre expõem `client_slug` + `client_name`. Ajuste os campos conforme a
-- estrutura real dos documentos retornados pela sua instância OPA.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.vw_atendimentos as
select
    d.id,
    c.slug as client_slug,
    c.name as client_name,
    d.external_id,
    coalesce(d.raw->>'protocolo', d.raw->>'protocol')            as protocolo,
    coalesce(d.raw->>'status', d.raw->>'situacao')               as status,
    coalesce(d.raw->>'departamento', d.raw->>'setor')            as departamento,
    coalesce(d.raw->>'canalComunicacao', d.raw->>'channel_id')   as canal,
    coalesce(d.raw->>'contato', d.raw->>'contato_id')            as contato_id,
    coalesce(d.raw->>'avaliacao', d.raw->>'rating')              as avaliacao,
    nullif(coalesce(d.raw->>'dataAbertura', d.raw->>'criadoEm'), '')::timestamptz   as aberto_em,
    nullif(coalesce(d.raw->>'dataEncerramento', d.raw->>'finishedAt'), '')::timestamptz as encerrado_em,
    d.synced_at,
    d.raw
from public.opa_documents d
join public.opa_clients c on c.id = d.client_id
where d.resource = 'atendimentos';

create or replace view public.vw_contatos as
select
    d.id,
    c.slug as client_slug,
    c.name as client_name,
    d.external_id,
    coalesce(d.raw->>'nome', d.raw->>'name')              as nome,
    coalesce(d.raw->>'telefone', d.raw->>'phone')         as telefone,
    coalesce(d.raw->>'email')                             as email,
    d.synced_at,
    d.raw
from public.opa_documents d
join public.opa_clients c on c.id = d.client_id
where d.resource = 'contatos';

create or replace view public.vw_mensagens as
select
    d.id,
    c.slug as client_slug,
    c.name as client_name,
    d.external_id,
    coalesce(d.raw->>'atendimento', d.raw->>'atendimentoId')   as atendimento_id,
    coalesce(d.raw->>'tipo', d.raw->>'direction')              as tipo,
    coalesce(d.raw->>'mensagem', d.raw->>'conteudo', d.raw->>'content') as conteudo,
    nullif(coalesce(d.raw->>'data', d.raw->>'criadoEm'), '')::timestamptz as enviado_em,
    d.synced_at,
    d.raw
from public.opa_documents d
join public.opa_clients c on c.id = d.client_id
where d.resource = 'mensagens';

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: o backend usa a SERVICE ROLE key (bypassa RLS). Ligamos RLS sem policies
-- públicas para que as tabelas NÃO fiquem acessíveis com a anon key por engano.
-- O token OPA fica em opa_clients.token_encrypted — nunca exponha via anon key.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.opa_clients   enable row level security;
alter table public.opa_documents enable row level security;
alter table public.opa_sync_logs enable row level security;
