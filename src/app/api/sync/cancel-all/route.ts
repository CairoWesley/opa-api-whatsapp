import { withAdminRole, json } from "@/lib/http";
import * as repo from "@/lib/repo";
import { drainQueue } from "@/lib/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/sync/cancel-all — KILL SWITCH GLOBAL (admin): pede cancelamento de
// todos os syncs rodando/na fila e esvazia os jobs que ainda não começaram.
export const POST = withAdminRole(async () => {
  const cancelled = await repo.requestCancel(null);
  const drained = await drainQueue().catch(() => 0);
  return json({ status: "cancel_requested", clients_flagged: cancelled, jobs_drained: drained });
});
