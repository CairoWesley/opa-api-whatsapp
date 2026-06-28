import { withAdmin, withAdminRole, json } from "@/lib/http";
import * as repo from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOOL_KEYS = new Set(["auto_resync_enabled", "auto_revalidate_enabled"]);
const NUM_KEYS = new Set(["revalidate_hours", "cache_final_days", "cache_final_ttl_hours"]);

function shape(s: Record<string, any>) {
  return {
    auto_resync_enabled: s.auto_resync_enabled ?? true,
    auto_revalidate_enabled: s.auto_revalidate_enabled ?? true,
    revalidate_hours: s.revalidate_hours ?? 12,
    cache_final_days: s.cache_final_days ?? 7,
    cache_final_ttl_hours: s.cache_final_ttl_hours ?? 24,
  };
}

// GET /api/settings — config global do painel (agendador + cache).
export const GET = withAdmin(async () => json(shape(await repo.getSettings())));

// PUT /api/settings — APENAS ADMIN (gestor não altera config de sync/cache).
export const PUT = withAdminRole(async (req) => {
  const body = await req.json().catch(() => ({}));
  for (const [k, v] of Object.entries(body || {})) {
    if (BOOL_KEYS.has(k)) await repo.setSetting(k, Boolean(v));
    else if (NUM_KEYS.has(k)) await repo.setSetting(k, Number(v));
  }
  return json(shape(await repo.getSettings()));
});
