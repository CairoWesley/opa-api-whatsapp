// Autenticação das rotas admin. Dois caminhos, ambos aceitos:
//   1. API / programático (Power BI, scripts): Authorization: Bearer <APP_ADMIN_TOKEN>
//      (ou header x-api-token).
//   2. Dashboard gerencial: cookie de sessão assinado, emitido no login usuário/senha.
import { timingSafeEqual } from "node:crypto";
import { config } from "./config";
import { readSessionCookie, verifySession } from "./session";
import { verifyApiToken } from "./api-tokens";

export class UnauthorizedError extends Error {}

export type Principal =
  | { kind: "token" }
  | { kind: "session"; uid: string; username: string; role: string }
  | { kind: "apitoken"; tokenId: string; name: string; scopes: string[]; clientId: string | null };

export class ForbiddenError extends Error {}

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

// Basic auth: Authorization: Basic base64(user:pass). O token pode vir como
// usuário OU senha (ex: -u token: ou -u qualquer:token).
function basicCreds(req: Request): { user: string; pass: string } | null {
  const auth = req.headers.get("authorization");
  if (!auth?.toLowerCase().startsWith("basic ")) return null;
  try {
    const dec = Buffer.from(auth.slice(6).trim(), "base64").toString("utf8");
    const i = dec.indexOf(":");
    if (i < 0) return { user: dec, pass: "" };
    return { user: dec.slice(0, i), pass: dec.slice(i + 1) };
  } catch {
    return null;
  }
}

// Candidatos de token: Bearer + (usuário e senha do Basic).
function tokenCandidates(req: Request): string[] {
  const out: string[] = [];
  const b = bearerToken(req);
  if (b) out.push(b);
  const basic = basicCreds(req);
  if (basic) {
    if (basic.pass) out.push(basic.pass);
    if (basic.user) out.push(basic.user);
  }
  return out;
}

// Auth da API do CLIENTE: aceita token admin, sessão, token de API (tabela)
// — via Bearer OU Basic. Async (consulta o hash do token no banco).
export async function requireApiAuth(req: Request): Promise<Principal> {
  const candidates = tokenCandidates(req);

  // 1. Token admin (acesso total).
  for (const c of candidates) if (safeEqual(c, config.adminToken())) return { kind: "token" };

  // 2. Sessão do dashboard.
  const sess = verifySession(readSessionCookie(req));
  if (sess) return { kind: "session", uid: sess.uid, username: sess.username, role: sess.role };

  // 3. Token de API (tabela api_tokens).
  for (const c of candidates) {
    const t = await verifyApiToken(c);
    if (t) return { kind: "apitoken", tokenId: t.id, name: t.name, scopes: t.scopes, clientId: t.client_id };
  }

  throw new UnauthorizedError("Não autenticado. Use Bearer/Basic com um token válido.");
}

// Valida a request por token de API OU por cookie de sessão. Retorna quem é.
export function requireAuth(req: Request): Principal {
  // 1. Token de API (sempre permitido — uso programático / Power BI).
  const tok = bearerToken(req);
  if (tok && safeEqual(tok, config.adminToken())) return { kind: "token" };

  // 2. Sessão do dashboard (cookie assinado).
  const sess = verifySession(readSessionCookie(req));
  if (sess) return { kind: "session", uid: sess.uid, username: sess.username, role: sess.role };

  throw new UnauthorizedError("Não autenticado. Faça login ou use um token válido.");
}

// Compat: rotas antigas chamavam requireAdmin(req). Mantém o nome.
export function requireAdmin(req: Request): void {
  requireAuth(req);
}

// Exige papel ADMIN: token de API (admin) OU sessão com role=admin.
// Sessão de gestor é rejeitada (403).
export function requireAdminRole(req: Request): void {
  const p = requireAuth(req);
  if (p.kind === "session" && p.role !== "admin") {
    throw new ForbiddenError("Apenas administradores podem fazer isso.");
  }
}
