import { json, error } from "@/lib/http";
import { requireAuth, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/auth/me — quem está autenticado (sessão do dashboard ou token de API).
export async function GET(req: Request) {
  try {
    const p = requireAuth(req);
    return json(
      p.kind === "session"
        ? { authenticated: true, via: "session", username: p.username }
        : { authenticated: true, via: "token" },
    );
  } catch (e) {
    if (e instanceof UnauthorizedError) return error(e.message, 401);
    return error("Erro interno", 500);
  }
}
