import { withAdmin, json, error } from "@/lib/http";
import * as repo from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/clients/:id/archive — arquiva (soft delete): some das listas e não
// sincroniza, mas mantém o histórico (runs/logs/dados).
export const POST = withAdmin(async (_req, { params }) => {
  const updated = await repo.updateClient(params.id, { archived: true, active: false });
  if (!updated) return error("Cliente não encontrado", 404);
  return json(updated);
});
