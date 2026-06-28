# Resumo Completo — opa-api-whatsapp

Documento único com **tudo que foi identificado e construído**: análise da API,
decisões de arquitetura, modelo de dados, segurança, cache, Power BI, execução
local com Docker e o bloqueio de push no GitHub.

---

## 1. O que é o projeto

Aplicação para **extrair dados da API OPA Suite** (plataforma omnichannel/WhatsApp)
de **vários clientes (multi-tenant)** e gravar no **Supabase (Postgres)**, com:

- **Autenticação por token** (na nossa API e na interface).
- **Interface web** para **criar / ativar / inativar / excluir** clientes.
- **Cache** nas leituras para acelerar.
- **Paginação por query** no read API.
- **Avaliação de integração com Power BI**.
- **Tudo rodável 100% local** (Supabase + app) via Docker Compose.

Substitui a antiga **DAG Airflow → MongoDB** (que você compartilhou) por um app
único em **Next.js + Supabase**.

---

## 2. Análise da API OPA Suite (o que identifiquei)

> A doc oficial (`api.opasuite.com.br`) está **bloqueada pela política de rede**
> deste ambiente (403). Reconstruí o contrato a partir de **3 fontes que você
> forneceu / que estavam públicas**: a **collection Postman oficial**, a **DAG de
> produção** e o **wiki** da OPA.

### Autenticação
- Header `Authorization: Bearer <TOKEN>` + `Content-Type: application/json`.
- Token gerado por usuário com **perfil de permissão tipo API** na OPA.
- **Multi-tenant por domínio**: cada cliente tem seu próprio `base_url`
  (ex.: `https://empresa.opasuite.net.br`) + token.

### Padrão de listagem (extração)
- Método **GET com body JSON** (incomum — exige tratamento especial, ver §5):
  ```json
  { "filter": { ... }, "options": { "skip": 0, "limit": 100 } }
  ```
- Resposta: `{ "data": [ { "_id": "...", ... }, ... ] }` — documentos estilo Mongo.
- **Paginação por `skip`/`limit`**: itera incrementando `skip` até `data` vir vazio.
- Upsert idempotente pela chave **`_id`**.

### Recursos e filtros (confirmados na collection Postman)

| Recurso (nosso) | Path | Filtros disponíveis |
|---|---|---|
| etiquetas | `/api/v1/etiqueta` | nome, id_criador, empresa |
| usuarios | `/api/v1/usuario` | nome, status, tipo |
| departamentos | `/api/v1/departamento` | nome, token, cod_pabx, realizaAtendimento |
| motivos | `/api/v1/atendimento/motivo` | motivo, departamentos |
| canais | `/api/v1/canal-comunicacao` | nome, id_atendente, status, canal, integracao |
| templates | `/api/v1/template` | atalho, tipo_mensagem |
| clientes | `/api/v1/cliente` | id, id_fornecedor, id_filial, nome, fantasia, cpf_cnpj, status, prospect, cliente, fornecedor |
| contatos | `/api/v1/contato` | nome, email_principal, fones.numero, classificacao, cli_emp |
| periodos | `/api/v1/atendimento/periodo` | nome, departamento, ativo, periodos.nome |
| **atendimentos** | `/api/v1/atendimento` | protocolo, **dataInicialAbertura**, dataFinalAbertura, dataInicialEncerramento, dataFinalEncerramento |
| **mensagens** | `/api/v1/atendimento/mensagem` | id_rota |

`atendimentos` usa janela incremental por `dataInicialAbertura` (configurável por
`lookback_days` no cliente), espelhando a DAG (que pegava o último mês).

### Da DAG de produção
- Confirmou os mesmos paths, a paginação skip/limit e o upsert por `_id`.
- Rodava a cada **3h**; um `companyId` por cliente. Replicado aqui como o cron
  (`/api/cron/sync`, agendável 3/3h) e o registro `opa_clients` (= companyId).

---

## 3. Arquitetura

```
Interface admin (Next.js)  ── cria/inativa clientes (base_url + token) ──►  opa_clients (Supabase)
                                                                                 │
 POST /api/sync/clients/:id  ou  cron /api/cron/sync                             ▼
        Extractor ──► OPA Suite API (GET + body {filter, options:{skip,limit}})
                       pagina por skip/limit · upsert por _id
                                                                                 │
                                                                                 ▼
                                       opa_documents (raw jsonb) ──► views vw_* (Power BI)
                                                                                 │
                       GET /api/data/:resource?limit=&page=  (paginado + cache)  ▼
                                                                         Consumidores / Power BI
```

### Stack (e por quê)
- **Next.js 14 (App Router, TypeScript)** — você pediu "use next sempre para a
  aplicação". UI + API + extração num só app. ("estrutura rápida")
- **Supabase (Postgres)** — você pediu Supabase. Armazenamento + views p/ BI.
- **AES-256-GCM** — criptografa os tokens OPA em repouso.
- **Cache TTL em memória** — acelera leituras; invalida pós-sync.
- **Docker Compose** — sobe Supabase + app 100% local.

### Pivots ao longo do caminho (registrados)
1. Comecei em **FastAPI** → migrei para **Next.js** quando você pediu.
2. Modelo de dados: adotei o estilo **schema-less** da sua DAG (raw `jsonb`,
   upsert por `_id`) em vez de tabelas rígidas — resiliente a mudanças da OPA.
3. Adicionei **Docker local** e depois o **stack Supabase local** com as suas
   chaves/secret reais.

---

## 4. Modelo de dados (Supabase)

- **`opa_clients`** — tenants: `slug`, `name`, `base_url`, `token_encrypted`,
  `company_id`, `active`, `sync_interval_minutes`, `lookback_days`,
  `extra_filters` (jsonb), `last_synced_at/status/error`.
- **`opa_documents`** — genérico: `client_id`, `resource`, `external_id` (=`_id`),
  `raw` (jsonb), `synced_at`. Único por `(client_id, resource, external_id)`.
  Índice GIN no `raw`.
- **`opa_sync_logs`** — auditoria por recurso/sync.
- **Views** `vw_atendimentos`, `vw_contatos`, `vw_mensagens` — campos achatados
  do `raw` (COALESCE PT/EN) + nome do cliente, para Power BI.
- **RLS** habilitado sem policies públicas (anon key não lê nada; o backend usa
  service role).

---

## 5. Detalhes técnicos que exigiram cuidado

- **GET com body**: o `fetch` do Node (undici) **proíbe** corpo em GET. Por isso
  o cliente OPA usa `node:https`/`node:http` diretamente (`src/lib/opa-client.ts`).
- **Token normalizado**: aceita com ou sem prefixo `Bearer `.
- **Upsert em lote** (500/lote) para não estourar payload do PostgREST.
- **Precedência de filtro**: `override (query)` > `extra_filters` do cliente >
  janela incremental.

---

## 6. Segurança

- Tokens OPA **criptografados** (AES-256-GCM); nunca retornados pela API.
- Service Role key e chave de cripto **só no server**.
- Auth por token **constante-time** em todas as rotas admin.
- RLS ligado; `opa_clients.token_encrypted` nunca exposto por anon key.

---

## 7. API (resumo)

Todas exigem `Authorization: Bearer <APP_ADMIN_TOKEN>` (exceto `/api/health`).

- `GET/POST /api/clients`, `GET/PATCH/DELETE /api/clients/:id`
- `POST /api/clients/:id/activate` · `/deactivate`
- `GET /api/sync/resources` (catálogo + filtros)
- `POST /api/sync/clients/:id?wait=&resources=` (body opcional `{filter}` = query custom)
- `POST /api/sync/all` · `GET /api/cron/sync` (Vercel Cron / scheduler)
- `GET /api/data/:resource?client_id=&limit=&offset=&page=&order_desc=` — **paginado + cache**
- `GET/DELETE /api/data/cache` · `GET /api/health`

### Paginação por query (o que você pediu)
`GET /api/data/atendimentos?client_id=<id>&limit=50&page=2` →
```json
{ "pagination": { "limit":50, "offset":50, "page":2, "total":1234, "returned":50, "has_more":true }, "data":[...] }
```
`page` (1-based) tem precedência sobre `offset`; máx. 1000/página.

---

## 8. Power BI — avaliação (viável)

Detalhe em `docs/powerbi-integration.md`. Recomendado o **conector PostgreSQL
nativo** do Power BI apontando para as views, com usuário `bi_readonly` restrito
(não acessa `opa_clients`/tokens). Alternativas: Web/REST (via nosso read API
paginado) e PostgREST (não recomendado por causa do RLS).

---

## 9. Rodar tudo LOCAL (sem nuvem)

```bash
cd opa-api-whatsapp
docker compose up -d --build           # Postgres + PostgREST + Kong + app
docker compose --profile studio up -d  # + Supabase Studio
```
- App/Admin: http://localhost:3000 (token `local-admin-token`)
- Supabase API (Kong): http://localhost:8000 · Studio: http://localhost:8001
- Postgres: `localhost:5432` (Power BI)

A migração é aplicada sozinha no primeiro boot. Secrets default = os do seu
self-hosted (troque via `.env`, ver `.env.docker.example`).

Sem Docker: `npm install && npm run dev` com `.env.local` (ver `.env.example`).
Validar credenciais OPA de um cliente: `OPA_BASE_URL=... OPA_TOKEN='Bearer ...' node scripts/smoke.mjs atendimento`.

---

## 10. Verificações feitas

- ✅ `tsc --noEmit` (typecheck) limpo.
- ✅ `next build` (produção + standalone) limpo — `server.js` + `static` gerados.
- ✅ App subiu local (`next dev`): `/api/health` 200, `/` 200, auth 401 sem token.

---

## 11. ⚠️ Bloqueio de push no GitHub (fora do meu controle)

- `git push` e GitHub MCP retornam **403** ("Resource not accessible by
  integration"). O verbose mostra o relay negando o serviço de escrita
  **`git-receive-pack`** (push), enquanto `git-upload-pack` (fetch) passa.
- É **negação de política de escrita** desta sessão — CLI local dá no mesmo 403,
  e não se deve contornar.
- **Entrega alternativa**: este pacote (`.zip`/`.tar.gz`) + `.bundle`/`.patch` com
  os commits (`bea572c`, `e191016`), autor `Claude <noreply@anthropic.com>`.
  Para publicar: extrair, ou aplicar o bundle e dar push do seu lado; ou
  habilitar escrita ao repo nas configs da integração.

---

## 12. Estrutura de arquivos

```
opa-api-whatsapp/
├── docker-compose.yml            stack local (db + rest + kong + app + studio)
├── Dockerfile / .dockerignore    imagem da app (Next standalone)
├── docker/
│   ├── kong/kong.yml             gateway (key-auth, /rest/v1)
│   └── postgres/                 00-roles.sql, 02-grants.sql (init)
├── supabase/migrations/0001_init.sql   schema + views + RLS
├── src/
│   ├── app/page.tsx              interface admin (React)
│   ├── app/api/                  rotas: clients, sync, data, cron, health
│   └── lib/                      opa-client, extractor, repo, crypto, cache,
│                                 auth, resources, config, validation, types
├── scripts/smoke.mjs            teste de conectividade com a OPA
├── docs/powerbi-integration.md  avaliação Power BI
├── README.md / RESUMO-PROJETO.md
└── .env.example / .env.docker.example
```
