import { withAdmin, json, error } from "@/lib/http";
import { isValidDoc, renderDoc } from "@/lib/docs";

export const runtime = "nodejs";

// GET /api/docs/:slug — conteúdo de um doc renderizado em HTML.
export const GET = withAdmin(async (_req, { params }) => {
  if (!isValidDoc(params.slug)) return error("Documento não encontrado", 404);
  const doc = await renderDoc(params.slug);
  return json(doc);
});
