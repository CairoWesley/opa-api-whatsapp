import { withAdminRole, json, error } from "@/lib/http";
import * as repo from "@/lib/repo";
import { hashPassword } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/users — lista usuários do dashboard (ADMIN).
export const GET = withAdminRole(async () => json({ users: await repo.listUsers() }));

// POST /api/users { username, password, role } — cria usuário (ADMIN).
export const POST = withAdminRole(async (req) => {
  const b = await req.json().catch(() => null);
  const username = String(b?.username ?? "").trim();
  const password = String(b?.password ?? "");
  const role = b?.role === "admin" ? "admin" : "gestor";
  if (!username || password.length < 6) return error("Usuário e senha (≥6) obrigatórios.", 422);
  try {
    await repo.createUser(username, hashPassword(password), role);
  } catch {
    return error("Usuário já existe.", 409);
  }
  return json({ status: "ok", username, role }, 201);
});
