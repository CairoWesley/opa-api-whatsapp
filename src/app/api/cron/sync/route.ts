import { json, error } from "@/lib/http";
import { config } from "@/lib/config";
import * as repo from "@/lib/repo";
import { enqueueSync } from "@/lib/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/cron/sync — chamado por um scheduler (ex: Vercel Cron).
// Autentica via `Authorization: Bearer <CRON_SECRET|APP_ADMIN_TOKEN>` e
// ENFILEIRA o sync de todos os ativos (o worker processa).
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const provided = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const secret = process.env.CRON_SECRET || config.adminToken();
  if (provided !== secret) return error("Não autorizado", 401);

  const clients = await repo.listClients(true);
  for (const c of clients) {
    await repo.setSyncState(c.id, "queued");
    await enqueueSync({ clientId: c.id });
  }
  return json({ status: "queued", count: clients.length });
}
