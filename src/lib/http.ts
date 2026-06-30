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
      await requireAdminRole(req);
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
    const t0 = Date.now();
    let principal: Principal | null = null;
    let res: Response;
    try {
      principal = await requireApiAuth(req);
      res = await handler(req, ctx, principal);
    } catch (err) {
      if (err instanceof UnauthorizedError) res = error(err.message, 401);
      else res = error(err instanceof Error ? err.message : "Erro interno", 500);
    }
    logApiCall(req, res, principal, Date.now() - t0);
    return res;
  };
}

// Registra a chamada (status + body de retorno) — best-effort, não bloqueia a
// resposta. Body truncado por config. Roda fora do caminho crítico.
function logApiCall(req: Request, res: Response, principal: Principal | null, ms: number) {
  void (async () => {
    try {
      const { config } = await import("./config");
      if (!config.apiLogEnabled()) return;
      const { insertApiLog } = await import("./apilog");
      const u = new URL(req.url);
      let body: string | null = null;
      try { body = (await res.clone().text()).slice(0, config.apiLogBodyMax()); } catch { body = null; }
      await insertApiLog({
        method: req.method,
        path: u.pathname,
        query: u.search ? u.search.slice(1) : null,
        status: res.status,
        client_id: principal?.kind === "apitoken" ? principal.clientId : null,
        token_id: principal?.kind === "apitoken" ? principal.tokenId : null,
        principal: principal ? principal.kind : "none",
        duration_ms: ms,
        response_body: body,
      });
    } catch {
      /* silencioso */
    }
  })();
}
