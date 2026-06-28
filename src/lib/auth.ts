// Autenticação por token das rotas admin.
import "server-only";
import { timingSafeEqual } from "node:crypto";
import { config } from "./config";

export class UnauthorizedError extends Error {}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// Aceita `Authorization: Bearer <token>` ou header `x-api-token`.
export function requireAdmin(req: Request): void {
  const auth = req.headers.get("authorization");
  const xToken = req.headers.get("x-api-token");
  let provided: string | null = null;
  if (auth?.toLowerCase().startsWith("bearer ")) provided = auth.slice(7).trim();
  else if (xToken) provided = xToken.trim();

  if (!provided || !safeEqual(provided, config.adminToken())) {
    throw new UnauthorizedError("Token de acesso ausente ou inválido.");
  }
}
