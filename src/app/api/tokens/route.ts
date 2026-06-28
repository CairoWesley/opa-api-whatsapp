import { withAdmin, json, error } from "@/lib/http";
import { listTokens, createToken } from "@/lib/api-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/tokens — lista tokens de API (mascarados, sem o valor em claro).
export const GET = withAdmin(async () => json({ tokens: await listTokens() }));

// POST /api/tokens { name, scopes? } — gera um token novo.
// O valor em claro é retornado UMA ÚNICA VEZ aqui.
export const POST = withAdmin(async (req) => {
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!name) return error("Informe um nome para o token.", 422);
  const scopes = Array.isArray(body?.scopes) ? body.scopes.map(String) : ["data:read"];
  const { token, row } = await createToken(name, scopes);
  return json({ token, ...row }, 201);
});
