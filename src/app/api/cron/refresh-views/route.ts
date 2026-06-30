import { json, error } from "@/lib/http";
import { config } from "@/lib/config";
import { refreshDueViews } from "@/lib/views";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST/GET /api/cron/refresh-views — atualiza as materialized views vencidas.
// Auth: Authorization: Bearer <CRON_SECRET|APP_ADMIN_TOKEN>. (O scheduler do
// worker já faz isso a cada tick; esta rota é p/ um cron externo, se preferir.)
async function handle(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const provided = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const secret = process.env.CRON_SECRET || config.adminToken();
  if (provided !== secret) return error("Não autorizado", 401);
  const refreshed = await refreshDueViews();
  return json({ refreshed, count: refreshed.length });
}

export const GET = handle;
export const POST = handle;
