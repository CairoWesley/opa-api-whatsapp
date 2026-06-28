import { NextResponse } from "next/server";
import { error } from "@/lib/http";
import * as repo from "@/lib/repo";
import { verifyPassword, signSession, SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/auth/login { username, password }
// Login do DASHBOARD. Em sucesso, seta cookie de sessão httpOnly.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");
  if (!username || !password) return error("Informe usuário e senha.", 422);

  // 1º acesso: cria o admin padrão (env) se a tabela estiver vazia.
  await repo.ensureSeedUser();

  const user = await repo.getUserByUsername(username);
  // Verifica senha sempre (mesmo sem user) p/ não vazar existência por timing.
  const ok =
    user && user.active ? verifyPassword(password, user.password_hash) : false;
  if (!user || !ok) return error("Usuário ou senha inválidos.", 401);

  await repo.touchUserLogin(user.id);
  const { token, maxAge } = signSession(user.id, user.username);

  const res = NextResponse.json({ user: { username: user.username } });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
  return res;
}
