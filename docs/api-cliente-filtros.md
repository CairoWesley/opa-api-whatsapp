# API do Cliente — leitura e filtros

API de **consumo** dos dados extraídos da OPA Suite. É a única superfície pública
(documentada no Swagger em `/api-docs`). As rotas administrativas (cadastro de
clientes, disparo de sync, etc.) ficam no **painel**, não nesta API.

## Autenticação

Toda chamada exige o token:

```
Authorization: Bearer <SEU_TOKEN>
```

Valide o token e veja a que dados ele dá acesso:

```bash
curl -X POST https://SEU_HOST/api/auth/validate \
  -H 'Content-Type: application/json' -d '{"token":"<SEU_TOKEN>"}'
```

## Endpoint principal

```
GET /api/data/{resource}
```

`resource` ∈ `etiquetas, usuarios, departamentos, motivos, canais, templates,
clientes, contatos, periodos, atendimentos, mensagens`.

### Parâmetros

| Parâmetro | Default | Descrição |
|---|---|---|
| `client_id` | — | filtra por um cliente (UUID); vazio = todos |
| `limit` | 100 | itens por página (máx **1000**) |
| `page` | — | página **1-based** (tem precedência sobre `offset`) |
| `offset` | 0 | deslocamento manual |
| `order_by` | `synced_at` | campo de ordenação (coluna ou campo do documento) |
| `order_desc` | `true` | `true` = mais recentes primeiro |
| `filter` | — | **repetível** — `campo:operador:valor` (ver abaixo) |

### Resposta

```json
{
  "resource": "atendimentos",
  "client_id": "…",
  "filters": [{ "field": "status", "op": "eq", "value": "aberto" }],
  "pagination": { "limit": 100, "offset": 0, "page": 1, "total": 1234, "returned": 100, "has_more": true },
  "data": [ { "id": "…", "external_id": "…", "raw": { … }, "synced_at": "…" } ]
}
```

Os campos do documento OPA ficam dentro de `raw`.

## Filtros

Formato: `filter=campo:operador:valor`. **Repita** o parâmetro para combinar
condições (são unidas por **AND**).

- Campos do documento são consultados no JSON (`raw->>'campo'`).
- `external_id`, `synced_at` e `client_id` são **colunas** (mais rápidos).

### Operadores

| Operador | Significado | Exemplo |
|---|---|---|
| `eq` | igual | `status:eq:aberto` |
| `neq` | diferente | `status:neq:fechado` |
| `like` / `ilike` | contém (sem diferenciar maiúsc.) | `protocolo:like:2024` |
| `gt` | maior que | `synced_at:gt:2026-06-01` |
| `gte` | maior ou igual | `synced_at:gte:2026-06-01` |
| `lt` | menor que | `synced_at:lt:2026-06-28` |
| `lte` | menor ou igual | `synced_at:lte:2026-06-28` |

> `gt/gte/lt/lte` comparam como texto — funciona para **datas ISO**
> (`2026-06-01`) e números desde que estejam zero-padded. Para datas, use o
> campo `synced_at` (quando o dado entrou) ou um campo de data do `raw`.

### Exemplos

Atendimentos abertos de um cliente:
```
GET /api/data/atendimentos?client_id=<id>&filter=status:eq:aberto
```

Protocolo contém "2024", 50 por página, página 2:
```
GET /api/data/atendimentos?filter=protocolo:like:2024&limit=50&page=2
```

Sincronizados a partir de 01/06/2026, mais antigos primeiro:
```
GET /api/data/atendimentos?filter=synced_at:gte:2026-06-01&order_by=synced_at&order_desc=false
```

Combinação (status aberto **E** departamento Suporte):
```
GET /api/data/atendimentos?filter=status:eq:aberto&filter=departamento:eq:Suporte
```

Contatos cujo telefone contém um DDD:
```
GET /api/data/contatos?filter=telefone:like:11
```

### cURL

```bash
curl -G https://SEU_HOST/api/data/atendimentos \
  -H 'Authorization: Bearer <SEU_TOKEN>' \
  --data-urlencode 'client_id=<id>' \
  --data-urlencode 'filter=status:eq:aberto' \
  --data-urlencode 'filter=departamento:eq:Suporte' \
  --data-urlencode 'limit=50' \
  --data-urlencode 'page=1'
```

## Cache

As leituras passam por um cache TTL (default 60s). Após cada sincronização o
cache do cliente é invalidado e a 1ª página de cada recurso é **pré-aquecida**
(resposta imediata). Filtros diferentes geram chaves de cache diferentes.

## Erros

| Código | Quando |
|---|---|
| 400 | recurso inválido, filtro malformado, operador desconhecido |
| 401 | token ausente ou inválido |
