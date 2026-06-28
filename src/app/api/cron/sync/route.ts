import { json, error } from "@/lib/http";
import { config } from "@/lib/config";
import { syncAllActive } from "@/lib/extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET /api/cron/sync — chamado por um scheduler (ex: Vercel Cron).
// Autentica via `Authorization: Bearer <CRON_SECRET|APP_ADMIN_TOKEN>`.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const provided = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const secret = process.env.CRON_SECRET || config.adminToken();
  if (provided !== secret) return error("Não autorizado", 401);

  const results = await syncAllActive();
  return json({ status: "ok", synced: results.length, results });
}
