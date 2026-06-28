import { withAdmin, json } from "@/lib/http";
import * as repo from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["auto_resync_enabled", "auto_revalidate_enabled", "revalidate_hours"]);

// GET /api/settings — config global do painel (agendador).
export const GET = withAdmin(async () => {
  const s = await repo.getSettings();
  return json({
    auto_resync_enabled: s.auto_resync_enabled ?? true,
    auto_revalidate_enabled: s.auto_revalidate_enabled ?? true,
    revalidate_hours: s.revalidate_hours ?? 12,
  });
});

// PUT /api/settings { auto_resync_enabled, auto_revalidate_enabled, revalidate_hours }
export const PUT = withAdmin(async (req) => {
  const body = await req.json().catch(() => ({}));
  for (const [k, v] of Object.entries(body || {})) {
    if (ALLOWED.has(k)) await repo.setSetting(k, k === "revalidate_hours" ? Number(v) : Boolean(v));
  }
  const s = await repo.getSettings();
  return json({
    auto_resync_enabled: s.auto_resync_enabled ?? true,
    auto_revalidate_enabled: s.auto_revalidate_enabled ?? true,
    revalidate_hours: s.revalidate_hours ?? 12,
  });
});
