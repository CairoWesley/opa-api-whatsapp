// Especificação OpenAPI 3.0 da API — servida em /api/openapi.json (pública) e
// renderizada pelo Swagger UI em /api-docs (público). Descreve os endpoints;
// as chamadas reais continuam exigindo auth (token ou sessão).
import { RESOURCE_KEYS } from "./resources";

export function buildOpenApi(serverUrl?: string) {
  const server = serverUrl || "/";
  return {
    openapi: "3.0.3",
    info: {
      title: "OPA API WhatsApp",
      version: "1.0.0",
      description:
        "Extração multi-cliente da API OPA Suite para Supabase.\n\n" +
        "**Autenticação:**\n" +
        "- **API / programático (ex: Power BI):** `Authorization: Bearer <APP_ADMIN_TOKEN>`.\n" +
        "- **Dashboard:** login usuário/senha → cookie de sessão (`/api/auth/login`).\n\n" +
        "As rotas admin aceitam qualquer um dos dois. Use o botão **Authorize** e " +
        "cole o token para testar aqui.",
    },
    servers: [{ url: server }],
    tags: [
      { name: "Auth", description: "Login do dashboard e validação de token" },
      { name: "Clients", description: "CRUD de clientes (tenants OPA)" },
      { name: "Sync", description: "Sincronização (extração) OPA → Supabase" },
      { name: "Data", description: "Leitura paginada dos dados extraídos" },
      { name: "Docs", description: "Documentação do projeto" },
      { name: "System", description: "Saúde e cron" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Token de API (APP_ADMIN_TOKEN).",
        },
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "opa_session",
          description: "Cookie de sessão emitido no login do dashboard.",
        },
      },
      schemas: {
        Error: { type: "object", properties: { error: { type: "string" } } },
        Client: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            slug: { type: "string" },
            name: { type: "string" },
            base_url: { type: "string" },
            company_id: { type: "string", nullable: true },
            active: { type: "boolean" },
            sync_interval_minutes: { type: "integer" },
            lookback_days: { type: "integer" },
            extra_filters: { type: "object" },
            last_synced_at: { type: "string", nullable: true },
            last_sync_status: { type: "string", nullable: true },
            last_sync_error: { type: "string", nullable: true },
          },
        },
        ClientCreate: {
          type: "object",
          required: ["slug", "name", "base_url", "token"],
          properties: {
            slug: { type: "string", example: "empresa-x" },
            name: { type: "string", example: "Empresa X" },
            base_url: { type: "string", example: "https://empresa.opasuite.net.br" },
            token: { type: "string", description: "Token da OPA (será criptografado)" },
            company_id: { type: "string", nullable: true },
            active: { type: "boolean", default: true },
            sync_interval_minutes: { type: "integer", default: 30 },
            lookback_days: { type: "integer", default: 30 },
            extra_filters: { type: "object", default: {} },
          },
        },
        TokenValidation: {
          type: "object",
          properties: {
            valid: { type: "boolean" },
            type: { type: "string", example: "admin" },
            scopes: { type: "array", items: { type: "string" } },
            access: {
              type: "object",
              properties: {
                resources: { type: "array", items: { type: "object" } },
                clients: { type: "array", items: { type: "object" } },
              },
            },
          },
        },
      },
    },
    // Rotas admin: aceitam token OU sessão.
    security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    paths: {
      "/api/health": {
        get: {
          tags: ["System"],
          summary: "Saúde do serviço",
          security: [],
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/auth/login": {
        post: {
          tags: ["Auth"],
          summary: "Login do dashboard (usuário/senha) → cookie de sessão",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["username", "password"],
                  properties: { username: { type: "string" }, password: { type: "string" } },
                },
              },
            },
          },
          responses: {
            "200": { description: "Autenticado (Set-Cookie opa_session)" },
            "401": { description: "Credenciais inválidas", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/api/auth/logout": {
        post: { tags: ["Auth"], summary: "Encerra a sessão (limpa cookie)", security: [], responses: { "200": { description: "OK" } } },
      },
      "/api/auth/me": {
        get: { tags: ["Auth"], summary: "Quem está autenticado", responses: { "200": { description: "Sessão/token válidos" }, "401": { description: "Não autenticado" } } },
      },
      "/api/auth/validate": {
        post: {
          tags: ["Auth"],
          summary: "Valida um token e retorna a que dados ele tem acesso",
          description:
            "Recebe um token (no header `Authorization: Bearer` ou no body `{token}`) " +
            "e, se válido, devolve o manifesto de acesso: recursos e clientes que o " +
            "token pode ler/operar.",
          security: [],
          requestBody: {
            required: false,
            content: { "application/json": { schema: { type: "object", properties: { token: { type: "string" } } } } },
          },
          responses: {
            "200": { description: "Token válido", content: { "application/json": { schema: { $ref: "#/components/schemas/TokenValidation" } } } },
            "401": { description: "Token inválido", content: { "application/json": { schema: { $ref: "#/components/schemas/TokenValidation" } } } },
          },
        },
      },
      "/api/clients": {
        get: {
          tags: ["Clients"],
          summary: "Lista clientes",
          parameters: [{ name: "active", in: "query", schema: { type: "boolean" }, description: "Filtra por ativo/inativo" }],
          responses: { "200": { description: "Lista", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Client" } } } } }, "401": { description: "Não autenticado" } },
        },
        post: {
          tags: ["Clients"],
          summary: "Cria cliente (token OPA é criptografado)",
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ClientCreate" } } } },
          responses: { "201": { description: "Criado", content: { "application/json": { schema: { $ref: "#/components/schemas/Client" } } } }, "409": { description: "Slug duplicado" }, "422": { description: "Body inválido" } },
        },
      },
      "/api/clients/{id}": {
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        get: { tags: ["Clients"], summary: "Detalhe do cliente", responses: { "200": { description: "OK" }, "404": { description: "Não encontrado" } } },
        patch: { tags: ["Clients"], summary: "Edita cliente (parcial; `token` re-criptografa)", requestBody: { content: { "application/json": { schema: { type: "object" } } } }, responses: { "200": { description: "Atualizado" }, "404": { description: "Não encontrado" } } },
        delete: { tags: ["Clients"], summary: "Exclui cliente e TODOS os dados (cascade)", responses: { "200": { description: "Removido" }, "404": { description: "Não encontrado" } } },
      },
      "/api/clients/{id}/activate": {
        post: { tags: ["Clients"], summary: "Ativa cliente", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" } } },
      },
      "/api/clients/{id}/deactivate": {
        post: { tags: ["Clients"], summary: "Inativa cliente", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" } } },
      },
      "/api/sync/resources": {
        get: { tags: ["Sync"], summary: "Catálogo de recursos OPA + filtros", responses: { "200": { description: "OK" } } },
      },
      "/api/sync/clients/{id}": {
        post: {
          tags: ["Sync"],
          summary: "Sincroniza 1 cliente",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "wait", in: "query", schema: { type: "boolean", default: true }, description: "false = dispara em background (202)" },
            { name: "resources", in: "query", schema: { type: "string" }, description: "csv de recursos; vazio = todos" },
          ],
          requestBody: { required: false, content: { "application/json": { schema: { type: "object", properties: { filter: { type: "object", description: "Sobrescreve o filtro do recurso" } } } } } },
          responses: { "200": { description: "Resultado do sync" }, "202": { description: "Agendado" }, "404": { description: "Não encontrado" } },
        },
      },
      "/api/sync/all": {
        post: { tags: ["Sync"], summary: "Sincroniza todos os clientes ativos", parameters: [{ name: "wait", in: "query", schema: { type: "boolean", default: false } }], responses: { "200": { description: "OK" }, "202": { description: "Agendado" } } },
      },
      "/api/cron/sync": {
        get: {
          tags: ["System"],
          summary: "Sync de todos os ativos (para scheduler)",
          description: "Autentica via `Authorization: Bearer <CRON_SECRET>` (ou APP_ADMIN_TOKEN). Vercel Cron: a cada 3h.",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "OK" }, "401": { description: "Não autorizado" } },
        },
      },
      "/api/data/{resource}": {
        get: {
          tags: ["Data"],
          summary: "Leitura paginada de um recurso (com cache)",
          parameters: [
            { name: "resource", in: "path", required: true, schema: { type: "string", enum: RESOURCE_KEYS } },
            { name: "client_id", in: "query", schema: { type: "string" }, description: "Filtra por cliente" },
            { name: "limit", in: "query", schema: { type: "integer", default: 100, maximum: 1000 } },
            { name: "page", in: "query", schema: { type: "integer" }, description: "1-based; tem precedência sobre offset" },
            { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
            { name: "order_desc", in: "query", schema: { type: "boolean", default: true } },
          ],
          responses: { "200": { description: "Página de dados" }, "400": { description: "Recurso inválido" } },
        },
      },
      "/api/data/cache": {
        get: { tags: ["Data"], summary: "Estatísticas do cache", responses: { "200": { description: "OK" } } },
        delete: { tags: ["Data"], summary: "Limpa o cache", responses: { "200": { description: "OK" } } },
      },
      "/api/docs": {
        get: { tags: ["Docs"], summary: "Lista a documentação do projeto", responses: { "200": { description: "OK" } } },
      },
      "/api/docs/{slug}": {
        get: { tags: ["Docs"], summary: "Documento renderizado em HTML", parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" }, "404": { description: "Não encontrado" } } },
      },
    },
  };
}
