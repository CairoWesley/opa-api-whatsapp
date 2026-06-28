import { withAdmin, json } from "@/lib/http";
import * as repo from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/sync/logs?client_id=&limit= — histórico de sync por recurso
// (status, registros, MOTIVO DO ERRO, início/fim).
export const GET = withAdmin(async (req) => {
  const q = new URL(req.url).searchParams;
  const clientId = q.get("client_id") || null;
  const limit = Number(q.get("limit") ?? 100);
  return json({ logs: await repo.listSyncLogs(clientId, limit) });
});
