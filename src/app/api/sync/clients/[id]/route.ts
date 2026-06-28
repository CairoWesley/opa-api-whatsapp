import { withAdmin, json, error } from "@/lib/http";
import * as repo from "@/lib/repo";
import { syncClient } from "@/lib/extractor";
import { RESOURCE_KEYS } from "@/lib/resources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // sync pode ser demorado

// POST /api/sync/clients/:id?wait=true&resources=atendimentos,contatos&full=true
// Body opcional: { filter: { ... } }  -> sobrescreve o filtro do recurso (query custom).
// O 1º sync de um cliente é SEMPRE full automaticamente; `full=true` força de novo.
export const POST = withAdmin(async (req, { params }) => {
  const url = new URL(req.url);
  const wait = url.searchParams.get("wait") !== "false"; // default: aguarda
  const full = url.searchParams.get("full") === "true"; // força sync full
  const resourcesParam = url.searchParams.get("resources");
  const resources = resourcesParam ? resourcesParam.split(",").map((s) => s.trim()) : undefined;

  if (!(await repo.getClient(params.id))) return error("Cliente não encontrado", 404);
  if (resources) {
    const invalid = resources.filter((r) => !RESOURCE_KEYS.includes(r));
    if (invalid.length) return error(`Recursos inválidos: ${invalid.join(", ")}`, 400);
  }

  const body = await req.json().catch(() => null);
  const override = body && typeof body === "object" && body.filter ? body.filter : undefined;

  if (!wait) {
    // dispara sem bloquear a resposta
    void syncClient(params.id, resources, override, full).catch(() => {});
    return json({ client_id: params.id, status: "scheduled" }, 202);
  }
  const result = await syncClient(params.id, resources, override, full);
  return json(result);
});
