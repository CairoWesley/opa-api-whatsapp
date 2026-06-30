import { withAdmin, json, error } from "@/lib/http";
import { refreshView, getView } from "@/lib/views";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/views/:slug/refresh — atualiza manualmente uma materialized view (admin).
export const POST = withAdmin(async (_req, { params }) => {
  const v = await getView(params.slug);
  if (!v) return error("View não encontrada", 404);
  if (!v.materialized) return error("View normal não precisa de refresh", 400);
  try {
    await refreshView(params.slug);
    const updated = await getView(params.slug);
    return json({ refreshed: params.slug, last_refreshed_at: updated?.last_refreshed_at });
  } catch (e) {
    return error(e instanceof Error ? e.message : "Falha no refresh", 500);
  }
});
