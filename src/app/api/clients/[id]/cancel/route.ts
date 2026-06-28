import { withAdmin, json, error } from "@/lib/http";
import * as repo from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/clients/:id/cancel — kill switch: pede cancelamento do sync em
// andamento. O worker aborta no próximo checkpoint (entre lotes/recursos).
export const POST = withAdmin(async (_req, { params }) => {
  if (!(await repo.getClient(params.id))) return error("Cliente não encontrado", 404);
  await repo.requestCancel(params.id);
  return json({ status: "cancel_requested", id: params.id });
});
