import { withAdmin, json, error } from "@/lib/http";
import { getJobStatus } from "@/lib/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/sync/jobs/:id — estado de um job da fila.
export const GET = withAdmin(async (_req, { params }) => {
  const st = await getJobStatus(params.id);
  if (!st) return error("Job não encontrado", 404);
  return json(st);
});
