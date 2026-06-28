// GET /api-docs — Swagger UI PÚBLICO (sem auth) apontando para /api/openapi.json.
// Assets do Swagger UI vêm da CDN (precisa de internet). As chamadas de teste
// continuam exigindo o token (botão Authorize).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HTML = `<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OPA API — Swagger</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    body { margin: 0; background: #0f172a; }
    .topbar { display: none; }
    #swagger-ui { max-width: 1100px; margin: 0 auto; }
    /* Fonte da descrição/markdown menor e mais legível */
    .swagger-ui .info .title { font-size: 26px; }
    .swagger-ui .info .markdown p,
    .swagger-ui .info .markdown li,
    .swagger-ui .renderedMarkdown p,
    .swagger-ui .renderedMarkdown li { font-size: 13px; line-height: 1.55; }
    .swagger-ui .info .markdown code,
    .swagger-ui .renderedMarkdown code,
    .swagger-ui code { font-size: 11.5px; padding: 1px 5px; line-height: 1.4; }
    .swagger-ui .info h1, .swagger-ui .info h2 { font-size: 17px; margin: 14px 0 6px; }
    .swagger-ui .info .markdown ul { margin: 6px 0; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js" crossorigin></script>
  <script>
    window.onload = function () {
      window.ui = SwaggerUIBundle({
        url: "/api/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
        persistAuthorization: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: "StandaloneLayout",
      });
    };
  </script>
</body>
</html>`;

export async function GET() {
  return new Response(HTML, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
