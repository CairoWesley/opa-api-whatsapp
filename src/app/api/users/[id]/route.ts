import { withAdminRole, json } from "@/lib/http";
import * as repo from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/users/:id — remove usuário (ADMIN).
export const DELETE = withAdminRole(async (_req, { params }) => {
  await repo.deleteUser(params.id);
  return json({ status: "deleted", id: params.id });
});
