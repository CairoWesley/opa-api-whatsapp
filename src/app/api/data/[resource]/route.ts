import { withApiAuth, json, error } from "@/lib/http";
import * as repo from "@/lib/repo";
import { isValidResource, RESOURCE_KEYS } from "@/lib/resources";
import { cacheGet, cacheSet, buildDataKey } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIMIT = 1000;
const OPS = new Set(["eq", "neq", "like", "ilike", "gt", "gte", "lt", "lte"]);
const FIELD_RE = /^[a-zA-Z0-9_]+$/;

// GET /api/data/:resource?client_id=&limit=&offset=&page=&order_desc=&order_by=
//   &filter=campo:op:valor   (repetível)
//
// Filtro: ops eq|neq|like|ilike|gt|gte|lt|lte. Campos do documento OPA são
// consultados em raw->>'campo'; external_id|synced_at|client_id são colunas.
export const GET = withApiAuth(async (req, { params }, principal) => {
  const resource = params.resource;
  if (!isValidResource(resource)) {
    return error(`Recurso inválido. Use um de: ${RESOURCE_KEYS.join(", ")}`, 400);
  }

  const q = new URL(req.url).searchParams;
  // Token POR CLIENTE: força o escopo desse cliente (ignora client_id da query).
  const scopedClient = principal.kind === "apitoken" ? principal.clientId : null;
  const clientId = scopedClient ?? (q.get("client_id") || null);
  const limit = Math.min(Math.max(Number(q.get("limit") ?? 100), 1), MAX_LIMIT);
  const page = q.get("page") ? Math.max(Number(q.get("page")), 1) : null;
  const offset = page !== null ? (page - 1) * limit : Math.max(Number(q.get("offset") ?? 0), 0);
  const orderDesc = q.get("order_desc") !== "false";
  const orderBy = q.get("order_by") || "synced_at";

  // Parse dos filtros: campo:op:valor (repetível)
  const filters: repo.DocFilter[] = [];
  for (const raw of q.getAll("filter")) {
    const idx1 = raw.indexOf(":");
    const idx2 = raw.indexOf(":", idx1 + 1);
    if (idx1 < 0 || idx2 < 0) return error(`Filtro inválido: "${raw}". Use campo:op:valor`, 400);
    const field = raw.slice(0, idx1);
    const op = raw.slice(idx1 + 1, idx2);
    const value = raw.slice(idx2 + 1);
    if (!FIELD_RE.test(field)) return error(`Campo inválido no filtro: "${field}"`, 400);
    if (!OPS.has(op)) return error(`Operador inválido: "${op}". Use: ${[...OPS].join(", ")}`, 400);
    filters.push({ field, op, value });
  }

  const cacheKey = buildDataKey({ clientId, resource, limit, offset, orderBy, orderDesc, filters });
  const cached = cacheGet(cacheKey);
  if (cached) return json(cached);

  const { rows, total } = await repo.queryDocuments(
    clientId,
    resource,
    limit,
    offset,
    orderDesc,
    filters,
    orderBy,
  );
  const body = {
    resource,
    client_id: clientId,
    filters,
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
