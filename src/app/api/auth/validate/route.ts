import { timingSafeEqual } from "node:crypto";
import { json } from "@/lib/http";
import { config } from "@/lib/config";
import { RESOURCES } from "@/lib/resources";
import { verifyApiToken } from "@/lib/api-tokens";
import * as repo from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// POST /api/auth/validate
// Recebe um token (Authorization: Bearer OU body {token}) e diz se é válido e a
// que dados dá acesso. Aceita o token admin (acesso total) e tokens de API.
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const headerTok = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const body = await req.json().catch(() => null);
  const bodyTok = body && typeof body.token === "string" ? body.token.trim() : "";
  const token = headerTok || bodyTok;

  if (!token) return json({ valid: false, error: "Token ausente." }, 401);

  const isAdmin = safeEqual(token, config.adminToken());
  const apiTok = isAdmin ? null : await verifyApiToken(token);
  if (!isAdmin && !apiTok) {
    return json({ valid: false, error: "Token inválido." }, 401);
  }

  const clients = await repo.listClients();
  return json({
    valid: true,
    type: isAdmin ? "admin" : "api_token",
    name: apiTok?.name,
    scopes: isAdmin
      ? ["clients:read", "clients:write", "sync:execute", "data:read", "docs:read"]
      : apiTok!.scopes,
    access: {
      resources: RESOURCES.map((r) => ({ key: r.key, path: r.path, filters: r.filters })),
      clients: clients.map((c) => ({ id: c.id, slug: c.slug, name: c.name, active: c.active })),
    },
    counts: { resources: RESOURCES.length, clients: clients.length },
  });
}

// GET também aceito (token só via header).
export async function GET(req: Request) {
  return POST(req);
}
