import { withAdmin, json, error } from "@/lib/http";
import * as repo from "@/lib/repo";
import { revalidateClient } from "@/lib/extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/clients/:id/revalidate
// Testa (GET limit 1) cada rota da OPA com o token do cliente e retorna a quais
// ele tem acesso. Desbloqueia as que voltaram a responder; bloqueia as 401/403.
export const POST = withAdmin(async (_req, { params }) => {
  if (!(await repo.getClient(params.id))) return error("Cliente não encontrado", 404);
  const result = await revalidateClient(params.id);
  return json({ client_id: params.id, ...result });
});
