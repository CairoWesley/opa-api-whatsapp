import { withAdmin, json } from "@/lib/http";
import { cacheClear, cacheStats } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/data/cache — estatísticas do cache
export const GET = withAdmin(async () => json(cacheStats()));

// DELETE /api/data/cache — limpa o cache de leituras
export const DELETE = withAdmin(async () => {
  cacheClear();
  return json({ status: "cleared" });
});
