import { withAdmin, json, error } from "@/lib/http";
import { encryptToken } from "@/lib/crypto";
import * as repo from "@/lib/repo";
import { parseClientUpdate } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/clients/:id
export const GET = withAdmin(async (_req, { params }) => {
  const row = await repo.getClient(params.id);
  if (!row) return error("Cliente não encontrado", 404);
  return json(row);
});

// PATCH /api/clients/:id
export const PATCH = withAdmin(async (req, { params }) => {
  const body = await req.json().catch(() => null);
  let patch: Record<string, unknown>;
  try {
    patch = parseClientUpdate(body);
  } catch (e) {
    return error(e instanceof Error ? e.message : "Body inválido", 422);
  }
  if (body?.token) patch.token_encrypted = encryptToken(String(body.token));
  if (Object.keys(patch).length === 0) return error("Nada para atualizar", 400);
  const updated = await repo.updateClient(params.id, patch);
  if (!updated) return error("Cliente não encontrado", 404);
  return json(updated);
});

// DELETE /api/clients/:id  (remove cliente + dados via cascade)
export const DELETE = withAdmin(async (_req, { params }) => {
  const existing = await repo.getClient(params.id);
  if (!existing) return error("Cliente não encontrado", 404);
  await repo.deleteClient(params.id);
  return json({ status: "deleted", id: params.id });
});
