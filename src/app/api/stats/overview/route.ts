import { withAdmin, json } from "@/lib/http";
import { buildOverview, startStatsRefresher } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/stats/overview — estatísticas completas da operação (dashboard).
// Arma o refresher de fundo (1x) p/ manter o cache quente entre requests.
export const GET = withAdmin(async () => {
  startStatsRefresher();
  return json(await buildOverview());
});
