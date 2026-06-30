// Especificação OpenAPI 3.0 — APENAS as rotas de CLIENTE (consumo de dados).
// Servida em /api/openapi.json (pública) e renderizada em /api-docs.
// As rotas administrativas (clientes, sync, docs, auth/login) NÃO entram aqui —
// são operadas pelo painel. O cliente usa esta API só com o token (Bearer).
import { RESOURCE_KEYS } from "./resources";
import { config } from "./config";

export function buildOpenApi(serverUrl?: string) {
  // URLs de PRODUÇÃO vêm do env (PUBLIC_BASE_URLS, várias por vírgula). Caem
  // primeiro na lista do Swagger. A URL derivada da request entra como extra.
  const prod = config.publicBaseUrls();
  const servers: { url: string; description?: string }[] = prod.map((u) => ({ url: u, description: "Produção" }));
  if (serverUrl && !prod.includes(serverUrl)) servers.push({ url: serverUrl, description: "Atual" });
  if (servers.length === 0) servers.push({ url: serverUrl || "/" });
  return {
    openapi: "3.0.3",
    info: {
      title: "OPA API WhatsApp — API do Cliente",
      version: "1.0.0",
      description:
        "API de **consumo de dados** da OPA Suite (atendimentos, contatos, " +
        "mensagens etc.). Autentique com o token: `Authorization: Bearer <TOKEN>` " +
        "(botão **Authorize**).\n\n" +
        "### Recursos\n" +
        "`" + RESOURCE_KEYS.join("`, `") + "`\n\n" +
        "### Paginação\n" +
        "`limit` (máx 1000) + `page` (1-based) **ou** `offset`. A resposta traz " +
        "`pagination` com `total`, `page`, `has_more`.\n\n" +
        "O **token já define o cliente** — não envie `client_id`.\n\n" +
        "### Filtros (parâmetro `filter`, repetível)\n" +
        "Formato: `filter=campo:operador:valor`. Repita para combinar (AND).\n\n" +
        "**O campo pode ser:**\n" +
        "- uma **coluna tipada** (transformação automática de campos comuns): " +
        "`status`, `protocolo`, `departamento`, `aberto_em`, `encerrado_em`, `nome`, " +
        "`telefone`, `email`, `atendimento_id`, etc. (rápido, indexado).\n" +
        "- **qualquer campo do JSON** cru: `nomeDoCampo` → `raw->>'campo'`.\n" +
        "- **campo aninhado** do JSON com ponto: `contato.nome` → `raw->contato->>nome`.\n\n" +
        "**Operadores:** `eq`, `neq`, `like`/`ilike` (contém), `gt`, `gte`, `lt`, `lte`.\n\n" +
        "**Exemplos:**\n" +
        "- Status aberto: `/api/data/atendimentos?filter=status:eq:aberto`\n" +
        "- Protocolo contém 2024: `/api/data/atendimentos?filter=protocolo:like:2024`\n" +
        "- Abertos a partir de uma data: `/api/data/atendimentos?filter=aberto_em:gte:2026-06-01`\n" +
        "- Campo do JSON cru: `/api/data/atendimentos?filter=prioridade:eq:alta`\n" +
        "- Campo aninhado do JSON: `/api/data/atendimentos?filter=contato.nome:ilike:silva`\n" +
        "- Combinando: `?filter=status:eq:aberto&filter=departamento:eq:Suporte`\n\n" +
        "### Ordenação\n" +
        "`order_by=<campo>` (default `synced_at`) + `order_desc=true|false`.",
    },
    servers,
    tags: [
      { name: "Dados", description: "Leitura paginada e filtrável dos dados extraídos" },
      { name: "Token", description: "Validação do token e seu escopo" },
      { name: "Sistema", description: "Saúde do serviço" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", description: "Token de API." },
      },
      schemas: {
        Error: { type: "object", properties: { error: { type: "string" } } },
        Page: {
          type: "object",
          properties: {
            resource: { type: "string" },
            client_id: { type: "string", nullable: true },
            filters: { type: "array", items: { type: "object" } },
            pagination: {
              type: "object",
              properties: {
                limit: { type: "integer" },
                offset: { type: "integer" },
                page: { type: "integer" },
                total: { type: "integer" },
                returned: { type: "integer" },
                has_more: { type: "boolean" },
              },
            },
            data: { type: "array", items: { type: "object" } },
          },
        },
        TokenValidation: {
          type: "object",
          properties: {
            valid: { type: "boolean" },
            type: { type: "string" },
            scopes: { type: "array", items: { type: "string" } },
            access: { type: "object" },
            counts: { type: "object" },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      "/api/data/{resource}": {
        get: {
          tags: ["Dados"],
          summary: "Lê um recurso (paginado + filtrável + cache)",
          parameters: [
            { name: "resource", in: "path", required: true, schema: { type: "string", enum: RESOURCE_KEYS } },
            { name: "limit", in: "query", schema: { type: "integer", default: 100, maximum: 1000 } },
            { name: "page", in: "query", schema: { type: "integer" }, description: "1-based; precede offset" },
            { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
            { name: "order_by", in: "query", schema: { type: "string", default: "synced_at" }, description: "Campo p/ ordenar (coluna ou campo do raw)" },
            { name: "order_desc", in: "query", schema: { type: "boolean", default: true } },
            {
              name: "filter",
              in: "query",
              required: false,
              explode: true,
              style: "form",
              schema: { type: "array", items: { type: "string" } },
              description: "campo:operador:valor — repetível. Ex: status:eq:aberto",
              example: "status:eq:aberto",
            },
          ],
          responses: {
            "200": { description: "Página de dados", content: { "application/json": { schema: { $ref: "#/components/schemas/Page" } } } },
            "400": { description: "Recurso/filtro inválido", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            "401": { description: "Token ausente/inválido" },
          },
        },
      },
      "/api/auth/validate": {
        post: {
          tags: ["Token"],
          summary: "Valida o token e mostra a que dados ele tem acesso",
          security: [],
          requestBody: { required: false, content: { "application/json": { schema: { type: "object", properties: { token: { type: "string" } } } } } },
          responses: {
            "200": { description: "Token válido", content: { "application/json": { schema: { $ref: "#/components/schemas/TokenValidation" } } } },
            "401": { description: "Token inválido", content: { "application/json": { schema: { $ref: "#/components/schemas/TokenValidation" } } } },
          },
        },
      },
      "/api/health": {
        get: { tags: ["Sistema"], summary: "Saúde do serviço", security: [], responses: { "200": { description: "OK" } } },
      },
    },
  };
}
