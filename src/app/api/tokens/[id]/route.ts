import { withAdmin, json } from "@/lib/http";
import { deleteToken, setTokenActive } from "@/lib/api-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/tokens/:id { active } — ativa/revoga.
export const PATCH = withAdmin(async (req, { params }) => {
  const body = await req.json().catch(() => null);
  await setTokenActive(params.id, Boolean(body?.active));
  return json({ id: params.id, active: Boolean(body?.active) });
});

// DELETE /api/tokens/:id — apaga o token.
export const DELETE = withAdmin(async (_req, { params }) => {
  await deleteToken(params.id);
  return json({ status: "deleted", id: params.id });
});
