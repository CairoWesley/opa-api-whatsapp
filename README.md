# opa-api-whatsapp

Extração **multi-cliente** da API [OPA Suite](https://api.opasuite.com.br) (plataforma
omnichannel/WhatsApp) para o **Supabase**, com **autenticação por token**, **cache**,
**interface web para criar/inativar clientes** e **read API paginado** pronto para Power BI.

Reescreve, em **Next.js + Supabase**, a antiga DAG Airflow → MongoDB que coletava
atendimentos/contatos/mensagens de cada cliente.

## Stack

- **Next.js 14** (App Router, TypeScript) — UI + API + extração num só app
- **Supabase** (Postgres) — armazenamento (`opa_documents` raw `jsonb` + views tipadas)
- **Auth por token** (`APP_ADMIN_TOKEN`) protegendo API e UI
- **AES-256-GCM** criptografando os tokens OPA em repouso
- **Cache TTL** em memória nas leituras
- **Vercel Cron** (opcional) para sync periódico

## Como funciona

```
Interface admin (Next.js)
   │  cria/inativa clientes (tenants OPA: base_url + token)
   ▼
opa_clients (Supabase)
   │
   ▼  POST /api/sync/clients/:id  (ou cron /api/cron/sync)
Extractor  ──►  OPA Suite API (GET + body {filter, options:{skip,limit}})
   │            pagina por skip/limit, upsert por _id
   ▼
opa_documents (raw jsonb)  ──►  views vw_atendimentos / vw_contatos / vw_mensagens
   │
   ▼  GET /api/data/:resource?limit=&page=        (paginado + cache)
Consumidores / Power BI
```

### Recursos extraídos (paths confirmados na collection oficial)

`etiquetas`, `usuarios`, `departamentos`, `motivos`, `canais`, `templates`,
`clientes`, `contatos`, `periodos`, `atendimentos`, `mensagens`.

Cada recurso aceita filtros próprios (ver `GET /api/sync/resources`). `atendimentos`
usa janela incremental `dataInicialAbertura` (configurável por `lookback_days`).

## Setup

### 1. Banco (Supabase)

Crie um projeto no Supabase e rode a migração em `supabase/migrations/0001_init.sql`
(SQL Editor ou `supabase db push`).

### 2. Variáveis de ambiente

```bash
cp .env.example .env.local
# preencha SUPABASE_URL, SUPABASE_SERVICE_KEY
# gere o token admin:        openssl rand -hex 32
# gere a chave de cripto:    node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 3. Rodar

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # produção
npm run typecheck    # validação de tipos
```

Abra `http://localhost:3000`, cole o `APP_ADMIN_TOKEN` e gerencie os clientes.

## Rodar TUDO local com Docker (Supabase incluso, sem nuvem)

Sobe Postgres + PostgREST + Kong + a app — e a migração é aplicada sozinha no
primeiro boot. Não precisa de Supabase na nuvem.

```bash
docker compose up -d --build           # db + rest + kong + app
docker compose --profile studio up -d  # + Supabase Studio (UI do banco)
```

| Serviço | URL |
|---|---|
| App / Admin | http://localhost:3000 (token = `APP_ADMIN_TOKEN`, default `local-admin-token`) |
| Supabase API (Kong) | http://localhost:8000 |
| Supabase Studio | http://localhost:8001 (profile `studio`) |
| Postgres (Power BI/SQL) | `localhost:5432` (user `postgres`) |

Os secrets default (JWT, service key, senha do Postgres) são os do seu ambiente
self-hosted — sobrescreva com um `.env` (veja `.env.docker.example`). Logs:
`docker compose logs -f app`. Derrubar: `docker compose down` (ou `down -v` para
apagar o volume do banco).

> Versão enxuta do seu stack: inclui o núcleo que a app usa (db + PostgREST +
> Kong + Studio). Componentes extras do self-hosted (auth/realtime/storage/
> analytics/vector/supavisor) foram omitidos por exigirem S3/arquivos adicionais
> e não serem usados por esta aplicação.

## API

Todas as rotas (exceto `/api/health`) exigem `Authorization: Bearer <APP_ADMIN_TOKEN>`
ou header `X-API-Token`.

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/clients?active=` | Lista clientes |
| POST | `/api/clients` | Cria cliente |
| GET/PATCH/DELETE | `/api/clients/:id` | Detalhe / editar / remover (cascade) |
| POST | `/api/clients/:id/activate` | Ativa cliente |
| POST | `/api/clients/:id/deactivate` | **Inativa** (para de sincronizar; dados preservados) |
| GET | `/api/sync/resources` | Catálogo de recursos + filtros |
| POST | `/api/sync/clients/:id?wait=&resources=` | Sincroniza um cliente (body opcional `{filter}`) |
| POST | `/api/sync/all?wait=` | Sincroniza todos os ativos |
| GET | `/api/cron/sync` | Endpoint para Vercel Cron (Bearer `CRON_SECRET`) |
| GET | `/api/data/:resource?client_id=&limit=&offset=&page=&order_desc=` | **Leitura paginada** (cacheada) |
| GET/DELETE | `/api/data/cache` | Stats / limpar cache |
| GET | `/api/health` | Healthcheck |

### Paginação por query

`GET /api/data/atendimentos?client_id=<id>&limit=50&page=2`

```json
{
  "resource": "atendimentos",
  "pagination": { "limit": 50, "offset": 50, "page": 2, "total": 1234, "returned": 50, "has_more": true },
  "data": [ /* documentos raw */ ]
}
```

`page` (1-based) tem precedência sobre `offset`. Limite máximo: 1000/página.

### Sync com query custom

```bash
curl -X POST "$BASE/api/sync/clients/<id>?resources=atendimentos&wait=true" \
  -H "Authorization: Bearer $APP_ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"filter": {"protocolo": "OPA202210"}}'
```

O `filter` no body sobrescreve a janela incremental/filtros do cliente.

## Power BI

Veja [`docs/powerbi-integration.md`](docs/powerbi-integration.md). Resumo:
conector **PostgreSQL nativo** do Power BI apontando para as views, com usuário
`bi_readonly` restrito (não acessa `opa_clients`/tokens).

## Segurança

- Tokens OPA criptografados (AES-256-GCM) — nunca retornados pela API.
- Service Role key e chave de cripto ficam **server-side** apenas.
- RLS habilitado nas tabelas sem policies públicas (anon key não lê nada).
- Auth por token constante-time em todas as rotas admin.

## Estrutura

```
opa-api-whatsapp/
├── src/
│   ├── app/
│   │   ├── page.tsx                 interface admin (React client)
│   │   ├── layout.tsx / globals.css
│   │   └── api/                     route handlers (clients, sync, data, cron, health)
│   └── lib/
│       ├── config.ts  crypto.ts  auth.ts  http.ts  validation.ts
│       ├── opa-client.ts           cliente OPA (GET+body, paginação skip/limit)
│       ├── extractor.ts            lógica de sync multi-cliente
│       ├── repo.ts  supabase.ts    acesso ao Supabase
│       ├── resources.ts            catálogo de recursos/filtros
│       └── cache.ts  types.ts
├── supabase/migrations/0001_init.sql
├── docs/powerbi-integration.md
└── vercel.json                     cron de sync (3/3h)
```

## Notas

- A API OPA exige **GET com body**; por isso o cliente usa `node:https` direto
  (o `fetch` do Node proíbe corpo em GET).
- O domínio `api.opasuite.com.br` é bloqueado por política de rede neste ambiente;
  os endpoints/filtros foram derivados da **collection Postman oficial** + DAG de produção.
