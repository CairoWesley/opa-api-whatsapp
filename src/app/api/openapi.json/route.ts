import { NextResponse } from "next/server";
import { buildOpenApi } from "@/lib/openapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/openapi.json — especificação OpenAPI (PÚBLICA, sem auth).
// O server é derivado da própria request para o "Try it out" funcionar.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const spec = buildOpenApi(`${url.protocol}//${url.host}`);
  return NextResponse.json(spec, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
