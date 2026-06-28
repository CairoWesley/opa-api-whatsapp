# Arquitetura — opa-api-whatsapp

Como o sistema funciona e como cada peça se liga. Documento técnico de
referência (complementa o `README.md`, que é o guia de uso).

---

## 1. Em uma frase

Um app **Next.js** que extrai dados da **API OPA Suite** de vários clientes
(multi-tenant), grava tudo como **JSON cru no Postgres (Supabase)** e expõe esses
dados por uma **API paginada com cache** — pronta para Power BI.

Substitui a antiga DAG Airflow → MongoDB por **um único app** (UI + API + extração).

---

## 2. Camadas e como se ligam

```
┌──────────────────────────────────────────────────────────────────────────┐
│  NAVEGADOR                                                                 │
│  src/app/page.tsx  ── interface admin (cria/ativa/inativa/exclui cliente,  │
│                       dispara sync, lê dados). Guarda o token no browser.  │
└───────────────┬──────────────────────────────────────────────────────────┘
                │  fetch  Authorization: Bearer <APP_ADMIN_TOKEN>
                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  CAMADA HTTP (Next App Router)  src/app/api/**/route.ts                    │
│  Cada rota = withAdmin(handler)  → valida token, trata erros               │
│  clients · sync · data · cron · health                                     │
└───────────────┬──────────────────────────────────────────────────────────┘
                │  chama
                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  CAMADA DE DOMÍNIO (lib)                                                    │
│  extractor.ts ─ orquestra o sync (loop recursos → páginas → upsert)        │
│  opa-client.ts ─ fala com a OPA (GET+body, pagina skip/limit)              │
│  repo.ts ─ todo acesso ao banco (CRUD clientes, upsert docs, logs)         │
│  crypto · auth · cache · resources · config · validation · types           │
└──────┬───────────────────────────────────────────────┬───────────────────┘
       │                                                │
       │ node:https (GET + body)                        │ supabase-js (service role)
       ▼                                                ▼
┌─────────────────────────┐              ┌─────────────────────────────────────┐
│  API OPA Suite          │              │  SUPABASE / POSTGRES                 │
│  (por cliente:          │              │  opa_clients · opa_documents ·       │
│   base_url + token)     │              │  opa_sync_logs                       │
│  {filter,options:{skip, │              │  views vw_atendimentos/contatos/msg  │
│   limit}} → {data:[_id]}│              │  (Power BI lê as views)              │
└─────────────────────────┘              └─────────────────────────────────────┘
```

Regra de ouro: **a UI nunca fala com o banco nem com a OPA direto**. Tudo passa
pela camada HTTP → domínio. O token da OPA só existe descriptografado dentro do
`extractor`, em memória, no momento do sync.

---

## 3. Mapa de módulos (quem chama quem)

### `src/lib/` — domínio (1.0k linhas, sem dependência da web)

| Arquivo | Responsabilidade | É chamado por | Chama |
|---|---|---|---|
| `config.ts` | Lê env vars (server-only). Funções `config.x()` | todos | `process.env` |
| `types.ts` | Tipos de domínio (`ClientRow`, `SyncResult`…) | todos | — |
| `auth.ts` | `requireAdmin(req)` — compara token em tempo constante | `http.ts` | `config` |
| `crypto.ts` | AES-256-GCM dos tokens OPA (`encryptToken`/`decryptToken`) | rotas clients, extractor | `config`, `node:crypto` |
| `cache.ts` | Cache TTL em memória (`cacheGet/Set/InvalidatePrefix`) | rota data, extractor | `config` |
| `resources.ts` | **Catálogo** dos 11 recursos OPA (path + filtros) | extractor, rotas sync/data | — |
| `supabase.ts` | Singleton do client supabase-js (service role) | `repo.ts` | `config` |
| `repo.ts` | **Toda** query SQL (via supabase-js) | rotas, extractor | `supabase.ts` |
| `opa-client.ts` | HTTP com a OPA: GET+body, paginação `iterDocuments()` | extractor | `node:https/http` |
| `extractor.ts` | **Orquestra o sync** multi-cliente | rotas sync/cron | opa-client, repo, crypto, cache, resources |
| `http.ts` | `withAdmin()` wrapper + `json()/error()` | todas as rotas | `auth.ts` |
| `validation.ts` | Valida/normaliza payload de cliente | rotas clients | — |

### `src/app/api/` — camada HTTP (rotas finas, delegam pro domínio)

| Rota | Métodos | Faz |
|---|---|---|
| `/api/health` | GET | status + stats do cache (**sem auth**) |
| `/api/clients` | GET, POST | lista / cria cliente (POST criptografa token) |
| `/api/clients/:id` | GET, PATCH, DELETE | detalhe / edita / exclui (cascade) |
| `/api/clients/:id/activate` · `/deactivate` | POST | liga/desliga `active` |
| `/api/sync/resources` | GET | catálogo de recursos+filtros |
| `/api/sync/clients/:id` | POST | sincroniza 1 cliente (`?wait=`, `?resources=`, body `{filter}`) |
| `/api/sync/all` | POST | sincroniza todos os ativos |
| `/api/cron/sync` | GET | mesmo que `/all`, auth por `CRON_SECRET` (p/ scheduler) |
| `/api/data/:resource` | GET | **leitura paginada + cache** |
| `/api/data/cache` | GET, DELETE | stats / limpa cache |

Toda rota (exceto `health` e `cron`, que tem auth própria) é embrulhada em
`withAdmin()` → valida `Authorization: Bearer <APP_ADMIN_TOKEN>` antes de rodar.

---

## 4. Fluxos principais (passo a passo)

### A) Cadastrar um cliente

```
UI (page.tsx)
  └─POST /api/clients {slug,name,base_url,token,...}
       └─withAdmin → valida token admin
       └─parseClientCreate() valida/normaliza (validation.ts)
       └─encryptToken(token)            (crypto.ts) → "v1:iv:tag:cipher"
       └─repo.insertClient(...)         (repo→supabase→Postgres)
       └─201 {cliente}  (token_encrypted NUNCA volta na resposta)
```

### B) Sincronizar (o coração do sistema)

```
POST /api/sync/clients/:id?resources=atendimentos
  └─withAdmin
  └─extractor.syncClient(id, ['atendimentos'], override?)
       ├─repo.getClientSecret(id)        → linha + token_encrypted
       ├─repo.setSyncState('running')
       ├─decryptToken(...)               → token em claro (só em memória)
       ├─new OpaClient({base_url, token, pageSize, timeout})
       └─para cada recurso:
            buildFilter()  ← precedência: override > extra_filters > janela incremental
            opa.iterDocuments(path, filter):   ← GENERATOR
                 loop:
                   GET base_url+path  body {filter, options:{skip,limit}}
                   resposta {data:[...]}
                   yield cada doc
                   skip += pageSize  até data vir vazio/curto
            acumula em lotes de 500 → repo.upsertDocuments()
                 upsert por (client_id, resource, external_id=_id)
            repo.insertSyncLog(ok|error, total)
       ├─repo.setSyncState('ok'|'error', markSynced)
       └─cacheInvalidatePrefix(`data:<id>:`)   ← derruba cache desse cliente
```

Pontos-chave:
- **GET com body**: `fetch`/undici proíbe → `opa-client.ts` usa `node:https` cru.
- **Idempotente**: re-sync sobrescreve o mesmo `_id`, não duplica.
- **Incremental**: `atendimentos` filtra `dataInicialAbertura >= hoje - lookback_days`.
- **Schema-less**: doc inteiro vai pro `raw jsonb`; nada quebra se a OPA mudar campos.

### C) Ler dados (Power BI ou app)

```
GET /api/data/atendimentos?client_id=<id>&limit=50&page=2
  └─withAdmin
  └─monta cacheKey = data:<client>:<resource>:<limit>:<offset>:<orderDesc>
  └─cacheGet(key)  → HIT? devolve na hora
  └─MISS: repo.queryDocuments() (count exact + range)  → Postgres
  └─resposta { pagination:{limit,offset,page,total,has_more}, data:[...] }
  └─cacheSet(key, body)   (TTL = CACHE_TTL_SECONDS)
```
`page` (1-based) tem precedência sobre `offset`. Máx 1000/página.

### D) Cron (sync periódico)

```
Scheduler (Vercel Cron / cron externo)
  └─GET /api/cron/sync  Authorization: Bearer <CRON_SECRET>
       └─syncAllActive() → para cada cliente ativo: syncClient()
```
Espelha a DAG antiga (rodava de 3/3h). Configurável em `vercel.json`.

---

## 5. Modelo de dados

```
opa_clients (tenant = base_url+token; ~ "companyId" da DAG)
   id, slug(unique), name, base_url, token_encrypted, company_id,
   active, sync_interval_minutes, lookback_days, extra_filters(jsonb),
   last_synced_at, last_sync_status, last_sync_error
        │ 1
        │ N  (FK on delete cascade)
opa_documents (genérico, raw)
   id, client_id, resource, external_id(=_id), raw(jsonb), synced_at
   UNIQUE(client_id, resource, external_id)   ← chave do upsert
   INDEX gin(raw)                             ← busca dentro do JSON
        ▲
        │ as views leem daqui
   vw_atendimentos · vw_contatos · vw_mensagens
   (achatam raw->>'campo' com COALESCE PT/EN + client_slug/name)

opa_sync_logs (auditoria)
   client_id, resource, status, records_upserted, error, started/finished_at
```

`resource` ∈ {etiquetas, usuarios, departamentos, motivos, canais, templates,
clientes, contatos, periodos, atendimentos, mensagens}.

**Por que JSON cru + views?** Resiliência. A OPA pode mudar/adicionar campos sem
quebrar a ingestão. As views (e só elas) assumem nomes de campos — se a OPA mudar,
ajusta-se a view, não o pipeline. Power BI consome as views, não o `raw`.

---

## 6. Segurança (como se encaixa)

**Dois caminhos de autenticação** (`auth.ts → requireAuth`), ambos aceitos nas rotas admin:
- **API / programático (Power BI, scripts):** `Authorization: Bearer <APP_ADMIN_TOKEN>`.
- **Dashboard gerencial:** login **usuário/senha** → cookie de sessão `opa_session`
  (httpOnly, HMAC-SHA256). Senha em hash **scrypt**; usuários em `dashboard_users`.
  1º admin semeado das envs `DASHBOARD_DEFAULT_*` no 1º login. Sessão stateless
  (cookie carrega `{uid,username,exp}` assinado). Rotas: `/api/auth/login|logout|me`.

| Camada | Mecanismo | Onde |
|---|---|---|
| API (token) | `Bearer`, comparado em **tempo constante** | `auth.ts` (`timingSafeEqual`) |
| Dashboard | senha **scrypt** + cookie de sessão **HMAC** httpOnly | `session.ts`, `dashboard_users` |
| Token da OPA em repouso | **AES-256-GCM**, formato `v1:iv:tag:cipher` | `crypto.ts` |
| Token nunca vaza | `repo` seleciona colunas explícitas; só `getClientSecret` traz `token_encrypted`, usado apenas no extractor | `repo.ts` |
| Banco | **RLS ligado sem policies** → anon key não lê nada; backend usa **service role** (bypassa RLS) | migration + `supabase.ts` |
| Segredos | `SUPABASE_SERVICE_KEY`, `APP_ENCRYPTION_KEY` só no server (`import "server-only"`) | `config.ts` |
| Cron | Secret separado (`CRON_SECRET`) | rota cron |

Fluxo do token OPA: **chega em claro no POST → criptografa → guarda cifrado →
descriptografa só em memória no sync → usa → descarta**. Nunca volta na API.

---

## 7. Cache

- **TTL em memória, por instância** (`Map`), chaveado pela query de leitura.
- Default `CACHE_TTL_SECONDS=60`.
- **Invalida sozinho** ao fim de cada sync, por prefixo `data:<clientId>:`.
- Múltiplas réplicas? Troque o `Map` por Redis mantendo a mesma interface
  (`cacheGet/Set/InvalidatePrefix`) — nada mais muda.

---

## 8. Configuração (env vars)

| Var | Pra quê | Default |
|---|---|---|
| `SUPABASE_URL` | endpoint Supabase/Kong | — (obrigatório) |
| `SUPABASE_SERVICE_KEY` | service role (bypassa RLS) | — (obrigatório) |
| `APP_ADMIN_TOKEN` | protege API/UI | — (obrigatório) |
| `APP_ENCRYPTION_KEY` | 32 bytes base64, cripto dos tokens | — (obrigatório) |
| `CRON_SECRET` | auth do cron | = admin token |
| `CACHE_TTL_SECONDS` | TTL do cache | 60 |
| `OPA_PAGE_SIZE` | tamanho da página skip/limit | 500 |
| `OPA_TIMEOUT_MS` | timeout das chamadas OPA | 30000 |
| `DEFAULT_LOOKBACK_DAYS` | janela incremental de atendimentos | 30 |

`config.ts` lê tudo. Faltou obrigatória → erro explícito no primeiro uso.

---

## 9. Stack local (Docker) — como os serviços se ligam

```
docker compose up -d --build
                                          host:5433 → Power BI
  ┌──────────┐   ┌──────────┐   ┌──────────┐        ▲
  │  app     │──►│  kong    │──►│  rest    │──► ┌──────────┐
  │ :3000    │   │ :8000    │   │(PostgREST)│   │  db      │
  └──────────┘   └──────────┘   └──────────┘    │ Postgres │
       │            gateway       REST p/ JSON   │ :5432    │
       │            (key-auth)                   └──────────┘
       │                                              ▲
       └─ SUPABASE_URL=http://kong:8000               │ init: 00-roles → 0001_init → 02-grants
                                              ┌────────┴────────┐
                                              │ meta + studio   │  (profile "studio", :8001)
                                              └─────────────────┘
```

- **app** (Next standalone) fala com o Supabase **via Kong** (`http://kong:8000`),
  igual produção — não bate no PostgREST direto.
- **kong** = gateway (auth por apikey, roteia `/rest/v1` → PostgREST).
- **rest** = PostgREST: expõe o Postgres como REST (o supabase-js usa isso).
- **db** = Postgres da Supabase. No 1º boot roda os 3 SQL de init em ordem:
  `00-roles.sql` (cria roles: supabase_admin, anon, authenticated, service_role)
  → `0001_init.sql` (tabelas+views+RLS) → `02-grants.sql` (privilégios).
- **db host port = 5433** (5432 estava ocupado por outro Postgres na máquina).
- **studio/meta** = UI opcional do banco (`--profile studio`, porta 8001).

Acessos: app `:3000` (token `local-admin-token`) · Kong `:8000` · Studio `:8001`
· Postgres `localhost:5433`.

---

## 10. Contrato da API OPA Suite (reconstruído)

- **Auth**: `Authorization: Bearer <token>` por cliente.
- **Listagem**: `GET <base_url><path>` com **body** `{filter, options:{skip,limit}}`.
- **Resposta**: `{ data: [ { _id, ... } ] }` (docs estilo Mongo).
- **Paginação**: incrementa `skip` até `data` vir vazio (ou menor que `pageSize`).
- **11 recursos** com seus filtros: ver `src/lib/resources.ts` ou
  `GET /api/sync/resources`.

---

## 11. Onde mexer quando...

| Quero... | Mexo em |
|---|---|
| Adicionar um recurso OPA | `src/lib/resources.ts` (+ view se for pro BI) |
| Mudar campos de uma view do BI | `supabase/migrations/0001_init.sql` (view) |
| Trocar regra de auth | `src/lib/auth.ts` |
| Trocar cache por Redis | `src/lib/cache.ts` (manter interface) |
| Ajustar janela incremental | env `DEFAULT_LOOKBACK_DAYS` ou `lookback_days` do cliente |
| Mudar paginação da OPA | `OPA_PAGE_SIZE` / `src/lib/opa-client.ts` |
| Adicionar endpoint | nova pasta em `src/app/api/.../route.ts` + `withAdmin` |
```
