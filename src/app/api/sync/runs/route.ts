import { withAdmin, json } from "@/lib/http";
import * as repo from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/sync/runs?client_id=&limit= — execuções de sync (run-level):
// status (running/ok/error/cancelled/interrupted), duração, registros.
export const GET = withAdmin(async (req) => {
  const q = new URL(req.url).searchParams;
  const clientId = q.get("client_id") || null;
  const limit = Number(q.get("limit") ?? 100);
  return json({ runs: await repo.listRuns(clientId, limit) });
});
