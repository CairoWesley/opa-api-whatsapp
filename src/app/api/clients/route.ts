import { withAdmin, json, error } from "@/lib/http";
import { encryptToken } from "@/lib/crypto";
import * as repo from "@/lib/repo";
import { parseClientCreate } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/clients?active=true|false
export const GET = withAdmin(async (req) => {
  const url = new URL(req.url);
  const activeParam = url.searchParams.get("active");
  const active = activeParam === null ? undefined : activeParam === "true";
  const rows = await repo.listClients(active);
  return json(rows);
});

// POST /api/clients
export const POST = withAdmin(async (req) => {
  const body = await req.json().catch(() => null);
  let input;
  try {
    input = parseClientCreate(body);
  } catch (e) {
    return error(e instanceof Error ? e.message : "Body inválido", 422);
  }
  try {
    const created = await repo.insertClient({
      slug: input.slug,
      name: input.name,
      base_url: input.base_url,
      token_encrypted: encryptToken(input.token),
      company_id: input.company_id,
      active: input.active,
      sync_interval_minutes: input.sync_interval_minutes,
      lookback_days: input.lookback_days,
      extra_filters: input.extra_filters,
    });
    return json(created, 201);
  } catch (e) {
    // provável violação de unique(slug)
    return error(`Não foi possível criar (slug duplicado?): ${e instanceof Error ? e.message : e}`, 409);
  }
});
