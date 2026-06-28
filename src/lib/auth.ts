// Autenticação das rotas admin. Dois caminhos, ambos aceitos:
//   1. API / programático (Power BI, scripts): Authorization: Bearer <APP_ADMIN_TOKEN>
//      (ou header x-api-token).
//   2. Dashboard gerencial: cookie de sessão assinado, emitido no login usuário/senha.
import { timingSafeEqual } from "node:crypto";
import { config } from "./config";
import { readSessionCookie, verifySession } from "./session";

export class UnauthorizedError extends Error {}

export type Principal =
  | { kind: "token" }
  | { kind: "session"; uid: string; username: string };

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function bearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  const xToken = req.headers.get("x-api-token");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  if (xToken) return xToken.trim();
  return null;
}

// Valida a request por token de API OU por cookie de sessão. Retorna quem é.
export function requireAuth(req: Request): Principal {
  // 1. Token de API (sempre permitido — uso programático / Power BI).
  const tok = bearerToken(req);
  if (tok && safeEqual(tok, config.adminToken())) return { kind: "token" };

  // 2. Sessão do dashboard (cookie assinado).
  const sess = verifySession(readSessionCookie(req));
  if (sess) return { kind: "session", uid: sess.uid, username: sess.username };

  throw new UnauthorizedError("Não autenticado. Faça login ou use um token válido.");
}

// Compat: rotas antigas chamavam requireAdmin(req). Mantém o nome.
export function requireAdmin(req: Request): void {
  requireAuth(req);
}
