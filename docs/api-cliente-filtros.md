# API do Cliente — leitura e filtros

API de **consumo** dos dados extraídos da OPA Suite. Única superfície pública
(Swagger em `/api-docs`). As rotas administrativas ficam no **painel**.

## Autenticação — token por cliente

Cada token é **escopo de um único cliente**: só retorna os dados daquele cliente.
**Não existe `client_id` na query** — o token já define o cliente.

```
Authorization: Bearer <SEU_TOKEN>
```

Também aceita **Basic auth** (token como senha):

```bash
curl -u api:<SEU_TOKEN> https://SEU_HOST/api/data/atendimentos
```

Ver a que rotas o token tem acesso:

```bash
curl -X POST https://SEU_HOST/api/auth/validate -H 'Content-Type: application/json' -d '{"token":"<SEU_TOKEN>"}'
```

## Endpoint

```
GET /api/data/{resource}
```

`resource` ∈ `etiquetas, usuarios, departamentos, motivos, canais, templates,
clientes, contatos, periodos, atendimentos, mensagens`.

| Parâmetro | Default | Descrição |
|---|---|---|
| `limit` | 100 | itens por página (máx **1000**) |
| `page` | — | página **1-based** (precede `offset`) |
| `offset` | 0 | deslocamento manual |
| `order_by` | `synced_at` | campo de ordenação (coluna, campo do raw ou caminho aninhado) |
| `order_desc` | `true` | `true` = mais recentes primeiro |
| `filter` | — | **repetível** — `campo:operador:valor` |

## Transformação automática de campos

Na extração, campos comuns são **promovidos automaticamente** para colunas
tipadas (indexadas) — você filtra direto por elas. O documento inteiro continua
em `raw`, então **qualquer outro campo** também é filtrável.

| Recurso | Colunas tipadas (transformação automática) |
|---|---|
| `atendimentos` | `protocolo`, `status`, `departamento`, `canal`, `contato_id`, `avaliacao`, `aberto_em`, `encerrado_em` |
| `contatos` | `nome`, `telefone`, `email` |
| `mensagens` | `atendimento_id`, `tipo`, `conteudo`, `enviado_em` |
| `clientes` | `nome`, `fantasia`, `cpf_cnpj`, `status` |
| `usuarios` | `nome`, `status`, `tipo` |
| `canais` | `nome`, `status`, `canal` |
| `etiquetas`/`departamentos`/`motivos`/`periodos`/`templates` | `nome`/`motivo`/`atalho`… |

Colunas-base (toda tabela): `external_id`, `synced_at`.

## Filtros — sintaxe

`filter=campo:operador:valor` — repita o parâmetro para combinar (unidos por **AND**).

**O `campo` pode ser:**
1. uma **coluna tipada** → `status`, `protocolo`, `aberto_em`… (rápido)
2. um **campo do JSON cru** (top-level) → `prioridade` vira `raw->>'prioridade'`
3. um **campo aninhado do JSON** (com ponto) → `contato.nome` vira `raw->contato->>nome`

### Operadores

| Operador | Significado | Exemplo |
|---|---|---|
| `eq` | igual | `status:eq:aberto` |
| `neq` | diferente | `status:neq:fechado` |
| `like` / `ilike` | contém (sem diferenciar maiúsc.) | `protocolo:like:2024` |
| `gt` `gte` | maior / maior-ou-igual | `aberto_em:gte:2026-06-01` |
| `lt` `lte` | menor / menor-ou-igual | `aberto_em:lt:2026-06-28` |

## Exemplos

### Colunas tipadas
```
# atendimentos abertos
GET /api/data/atendimentos?filter=status:eq:aberto

# protocolo contém "2024", 50 por página, página 2
GET /api/data/atendimentos?filter=protocolo:like:2024&limit=50&page=2

# abertos a partir de 01/06/2026, mais antigos primeiro
GET /api/data/atendimentos?filter=aberto_em:gte:2026-06-01&order_by=aberto_em&order_desc=false

# encerrados num intervalo
GET /api/data/atendimentos?filter=encerrado_em:gte:2026-06-01&filter=encerrado_em:lt:2026-07-01

# departamento Suporte E status aberto
GET /api/data/atendimentos?filter=departamento:eq:Suporte&filter=status:eq:aberto

# contatos com telefone que contém DDD 11
GET /api/data/contatos?filter=telefone:like:11

# contato por e-mail exato
GET /api/data/contatos?filter=email:eq:joao@empresa.com

# mensagens de um atendimento
GET /api/data/mensagens?filter=atendimento_id:eq:5f89...&order_by=enviado_em&order_desc=false
```

### Filtrando o JSON cru (campos não promovidos)
```
# campo top-level do documento OPA que não virou coluna
GET /api/data/atendimentos?filter=prioridade:eq:alta
GET /api/data/atendimentos?filter=origem:eq:whatsapp

# por sincronização (quando o dado entrou no nosso banco)
GET /api/data/atendimentos?filter=synced_at:gte:2026-06-28
```

### Filtrando campo ANINHADO do JSON (com ponto)
```
# raw.contato.nome
GET /api/data/atendimentos?filter=contato.nome:ilike:silva

# raw.atendente.id
GET /api/data/atendimentos?filter=atendente.id:eq:6511b0...

# raw.avaliacao.nota  (nível 2 de profundidade)
GET /api/data/atendimentos?filter=avaliacao.nota:gte:4

# raw.fones.numero  (contatos)
GET /api/data/contatos?filter=fones.numero:like:9999
```

### cURL completo
```bash
curl -G https://SEU_HOST/api/data/atendimentos \
  -H 'Authorization: Bearer <SEU_TOKEN>' \
  --data-urlencode 'filter=status:eq:aberto' \
  --data-urlencode 'filter=contato.nome:ilike:silva' \
  --data-urlencode 'order_by=aberto_em' \
  --data-urlencode 'order_desc=true' \
  --data-urlencode 'limit=50' \
  --data-urlencode 'page=1'
```

### Basic auth
```bash
curl -u "api:<SEU_TOKEN>" \
  "https://SEU_HOST/api/data/contatos?filter=email:ilike:gmail.com&limit=20"
```

## Resposta

```json
{
  "resource": "atendimentos",
  "client_id": "<forçado pelo token>",
  "filters": [{ "field": "status", "op": "eq", "value": "aberto" }],
  "pagination": { "limit": 50, "offset": 0, "page": 1, "total": 1234, "returned": 50, "has_more": true },
  "data": [ { "id": "…", "external_id": "…", "protocolo": "…", "status": "aberto", "raw": { … }, "synced_at": "…" } ]
}
```

Cada linha traz as **colunas tipadas** + o `raw` (documento OPA completo).

## Erros

| Código | Quando |
|---|---|
| 400 | recurso inválido, filtro malformado, operador desconhecido |
| 401 | token ausente ou inválido |

## Cache

Leituras passam por cache TTL (default 60s). Cada combinação de filtros tem sua
própria chave. Após cada sync, o cache do cliente é invalidado e a 1ª página é
pré-aquecida.
