import { withAdmin, json, error } from "@/lib/http";
import * as repo from "@/lib/repo";
import { isValidResource, RESOURCE_KEYS } from "@/lib/resources";
import { cacheGet, cacheSet } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIMIT = 1000;

// GET /api/data/:resource?client_id=&limit=&offset=&page=&order_desc=
// Paginação baseada na query passada. `page` (1-based) tem precedência sobre `offset`.
export const GET = withAdmin(async (req, { params }) => {
  const resource = params.resource;
  if (!isValidResource(resource)) {
    return error(`Recurso inválido. Use um de: ${RESOURCE_KEYS.join(", ")}`, 400);
  }

  const q = new URL(req.url).searchParams;
  const clientId = q.get("client_id") || null;
  const limit = Math.min(Math.max(Number(q.get("limit") ?? 100), 1), MAX_LIMIT);
  const page = q.get("page") ? Math.max(Number(q.get("page")), 1) : null;
  const offset = page !== null ? (page - 1) * limit : Math.max(Number(q.get("offset") ?? 0), 0);
  const orderDesc = q.get("order_desc") !== "false";

  const cacheKey = `data:${clientId ?? "*"}:${resource}:${limit}:${offset}:${orderDesc}`;
  const cached = cacheGet(cacheKey);
  if (cached) return json(cached);

  const { rows, total } = await repo.queryDocuments(clientId, resource, limit, offset, orderDesc);
  const body = {
    resource,
    client_id: clientId,
    pagination: {
      limit,
      offset,
      page: Math.floor(offset / limit) + 1,
      total,
      returned: rows.length,
      has_more: offset + rows.length < total,
    },
    data: rows,
  };
  cacheSet(cacheKey, body);
  return json(body);
});
