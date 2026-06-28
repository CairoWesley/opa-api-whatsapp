// Helpers para route handlers: auth guard + respostas JSON padronizadas.
import { NextResponse } from "next/server";
import { requireAdmin, requireAdminRole, requireApiAuth, UnauthorizedError, ForbiddenError, type Principal } from "./auth";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// Envolve o handler aplicando auth e tratamento de erros uniforme.
export function withAdmin(
  handler: (req: Request, ctx: { params: Record<string, string> }) => Promise<Response>,
) {
  return async (req: Request, ctx: { params: Record<string, string> }) => {
    try {
      requireAdmin(req);
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof UnauthorizedError) return error(err.message, 401);
      const msg = err instanceof Error ? err.message : "Erro interno";
      return error(msg, 500);
    }
  };
}

// Só ADMIN (papel). Gestor → 403.
export function withAdminRole(
  handler: (req: Request, ctx: { params: Record<string, string> }) => Promise<Response>,
) {
  return async (req: Request, ctx: { params: Record<string, string> }) => {
    try {
      requireAdminRole(req);
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof UnauthorizedError) return error(err.message, 401);
      if (err instanceof ForbiddenError) return error(err.message, 403);
      const msg = err instanceof Error ? err.message : "Erro interno";
      return error(msg, 500);
    }
  };
}

// Como withAdmin, mas para a API do CLIENTE: aceita token admin, sessão E
// tokens de API (Bearer ou Basic auth). Repassa o principal ao handler
// (p/ aplicar o escopo de cliente do token).
export function withApiAuth(
  handler: (req: Request, ctx: { params: Record<string, string> }, principal: Principal) => Promise<Response>,
) {
  return async (req: Request, ctx: { params: Record<string, string> }) => {
    try {
      const principal = await requireApiAuth(req);
      return await handler(req, ctx, principal);
    } catch (err) {
      if (err instanceof UnauthorizedError) return error(err.message, 401);
      const msg = err instanceof Error ? err.message : "Erro interno";
      return error(msg, 500);
    }
  };
}
