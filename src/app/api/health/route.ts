import { json } from "@/lib/http";
import { cacheStats } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/health — público (sem auth)
export async function GET() {
  return json({ status: "ok", cache: cacheStats() });
}
