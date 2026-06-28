import { withAdmin, json } from "@/lib/http";
import { syncAllActive } from "@/lib/extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/sync/all?wait=false
// Sincroniza todos os clientes ativos. Ideal para um cron (ex: Vercel Cron).
export const POST = withAdmin(async (req) => {
  const wait = new URL(req.url).searchParams.get("wait") === "true";
  if (!wait) {
    void syncAllActive().catch(() => {});
    return json({ status: "scheduled" }, 202);
  }
  const results = await syncAllActive();
  return json({ status: "ok", results });
});
