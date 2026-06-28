import { withAdmin, json } from "@/lib/http";
import { buildOverview } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/stats/overview — estatísticas completas da operação (dashboard).
export const GET = withAdmin(async () => json(await buildOverview()));
