import { withAdmin, json } from "@/lib/http";
import { cacheClear, cacheStats } from "@/lib/cache";
import { warmClientCache } from "@/lib/extractor";
import { RESOURCE_KEYS } from "@/lib/resources";
import * as repo from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET /api/data/cache — estatísticas do cache
export const GET = withAdmin(async () => json(cacheStats()));

// DELETE /api/data/cache — limpa o cache de leituras
export const DELETE = withAdmin(async () => {
  cacheClear();
  return json({ status: "cleared" });
});

// POST /api/data/cache — "monta o cache": pré-carrega a 1ª página de cada
// recurso para todos os clientes ativos.
export const POST = withAdmin(async () => {
  const clients = await repo.listClients(true);
  for (const c of clients) {
    await warmClientCache(c.id, RESOURCE_KEYS).catch(() => {});
  }
  return json({ status: "warmed", clients: clients.length, stats: cacheStats() });
});
