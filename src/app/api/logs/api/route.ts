import { withAdmin, json } from "@/lib/http";
import { listApiLogs } from "@/lib/apilog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/logs/api?client_id=&status=&limit= — logs da API do cliente (admin).
export const GET = withAdmin(async (req) => {
  const u = new URL(req.url);
  const rows = await listApiLogs({
    clientId: u.searchParams.get("client_id"),
    status: u.searchParams.get("status") ? Number(u.searchParams.get("status")) : null,
    limit: u.searchParams.get("limit") ? Number(u.searchParams.get("limit")) : 100,
  });
  return json(rows);
});
