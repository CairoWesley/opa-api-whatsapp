import { withAdmin, json, error } from "@/lib/http";
import * as repo from "@/lib/repo";
import { enqueueSync } from "@/lib/queue";
import { RESOURCE_KEYS } from "@/lib/resources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/sync/clients/:id?resources=atendimentos,contatos&full=true
// Enfileira o sync (processado pelo worker). O 1º sync é full automaticamente;
// `full=true` força full de novo.
export const POST = withAdmin(async (req, { params }) => {
  const url = new URL(req.url);
  const full = url.searchParams.get("full") === "true";
  const resourcesParam = url.searchParams.get("resources");
  const resources = resourcesParam ? resourcesParam.split(",").map((s) => s.trim()) : undefined;

  if (!(await repo.getClient(params.id))) return error("Cliente não encontrado", 404);
  if (resources) {
    const invalid = resources.filter((r) => !RESOURCE_KEYS.includes(r));
    if (invalid.length) return error(`Recursos inválidos: ${invalid.join(", ")}`, 400);
  }

  await repo.setSyncState(params.id, "queued");
  const jobId = await enqueueSync({ clientId: params.id, resources, full });
  return json({ client_id: params.id, status: "queued", job_id: jobId }, 202);
});
