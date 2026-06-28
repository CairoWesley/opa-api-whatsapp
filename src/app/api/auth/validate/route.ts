import { timingSafeEqual } from "node:crypto";
import { json } from "@/lib/http";
import { config } from "@/lib/config";
import { RESOURCES } from "@/lib/resources";
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
// Recebe um token (header Authorization: Bearer OU body {token}) e diz se é
// válido e A QUE DADOS ele dá acesso (recursos + clientes).
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const headerTok = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const body = await req.json().catch(() => null);
  const bodyTok = body && typeof body.token === "string" ? body.token.trim() : "";
  const token = headerTok || bodyTok;

  if (!token || !safeEqual(token, config.adminToken())) {
    return json({ valid: false, error: "Token ausente ou inválido." }, 401);
  }

  // Token de admin = acesso total. Lista o que ele pode ler/operar.
  const clients = await repo.listClients();
  return json({
    valid: true,
    type: "admin",
    scopes: [
      "clients:read",
      "clients:write",
      "sync:execute",
      "data:read",
      "docs:read",
    ],
    access: {
      resources: RESOURCES.map((r) => ({ key: r.key, path: r.path, filters: r.filters })),
      clients: clients.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        active: c.active,
        last_synced_at: c.last_synced_at,
      })),
    },
    counts: { resources: RESOURCES.length, clients: clients.length },
  });
}

// GET também aceito (token só via header).
export async function GET(req: Request) {
  return POST(req);
}
