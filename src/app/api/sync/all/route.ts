import { withAdmin, json } from "@/lib/http";
import * as repo from "@/lib/repo";
import { enqueueSync } from "@/lib/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/sync/all?full=true — enfileira o sync de todos os clientes ativos.
export const POST = withAdmin(async (req) => {
  const full = new URL(req.url).searchParams.get("full") === "true";
  const clients = await repo.listClients(true);
  const jobs: { client_id: string; job_id: string }[] = [];
  for (const c of clients) {
    await repo.setSyncState(c.id, "queued");
    const jobId = await enqueueSync({ clientId: c.id, full });
    jobs.push({ client_id: c.id, job_id: jobId });
  }
  return json({ status: "queued", count: jobs.length, jobs }, 202);
});
