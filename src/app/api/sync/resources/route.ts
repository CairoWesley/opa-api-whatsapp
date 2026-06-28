import { withAdmin, json } from "@/lib/http";
import { RESOURCES } from "@/lib/resources";

export const runtime = "nodejs";

// GET /api/sync/resources — catálogo de recursos e filtros (para montar queries).
export const GET = withAdmin(async () => {
  return json({ resources: RESOURCES });
});
