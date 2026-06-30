import { withAdmin, json, error } from "@/lib/http";
import { listViews, upsertView } from "@/lib/views";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/views — lista as definições de view (admin).
export const GET = withAdmin(async () => json(await listViews()));

// POST /api/views — cria/atualiza uma view (admin).
// body: { slug, name, sql, materialized, refresh_interval_minutes }
export const POST = withAdmin(async (req) => {
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") return error("Body inválido", 422);
  try {
    const row = await upsertView({
      slug: String(b.slug ?? "").trim(),
      name: String(b.name ?? "").trim() || String(b.slug ?? ""),
      sql: String(b.sql ?? ""),
      materialized: Boolean(b.materialized ?? false),
      refresh_interval_minutes: b.refresh_interval_minutes != null ? Number(b.refresh_interval_minutes) : undefined,
    });
    return json(row, 201);
  } catch (e) {
    return error(e instanceof Error ? e.message : "Falha ao criar view", 400);
  }
});
