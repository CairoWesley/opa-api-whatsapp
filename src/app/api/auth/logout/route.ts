import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/auth/logout — apaga o cookie de sessão.
export async function POST() {
  const res = NextResponse.json({ status: "ok" });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
