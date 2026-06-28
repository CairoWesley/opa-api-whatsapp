// Helpers para route handlers: auth guard + respostas JSON padronizadas.
import { NextResponse } from "next/server";
import { requireAdmin, UnauthorizedError } from "./auth";

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
