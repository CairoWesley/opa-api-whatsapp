import { withApiAuth, withAdmin, json, error } from "@/lib/http";
import { queryView, upsertView, deleteView, getView } from "@/lib/views";
import { cacheGet, cacheSet } from "@/lib/cache";
import { config } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIMIT = 1000;

// GET /api/views/:slug — CLIENTE consome a view (token). Escopado por client_id
// (token por cliente). Paginação: limit (máx 1000) + page|offset.
export const GET = withApiAuth(async (req, { params }, principal) => {
  const slug = params.slug;
  const v = await getView(slug);
  if (!v || !v.enabled) return error("View não encontrada", 404);

  const qs = new URL(req.url).searchParams;
  const tokenClient = principal.kind === "apitoken" ? principal.clientId : null;

  // View COM DONO: só o token do cliente dono (ou admin/sessão) acessa. Outro
  // cliente recebe 404 (não revela a existência da view). Escopo = o dono.
  let clientId: string | null;
  if (v.client_id) {
    if (principal.kind === "apitoken" && principal.clientId !== v.client_id) {
      return error("View não encontrada", 404);
    }
    clientId = v.client_id;
  } else {
    // Compartilhada: escopa pelas linhas do cliente do token (admin vê tudo).
    clientId = tokenClient ?? (qs.get("client_id") || null);
  }
  const limit = Math.min(Math.max(Number(qs.get("limit") ?? 100), 1), MAX_LIMIT);
  const page = qs.get("page") ? Math.max(Number(qs.get("page")), 1) : null;
  const offset = page !== null ? (page - 1) * limit : Math.max(Number(qs.get("offset") ?? 0), 0);

  const cacheKey = `view:${slug}:${clientId ?? "*"}:${limit}:${offset}`;
  const cached = cacheGet(cacheKey);
  if (cached) return json(cached);

  const { rows, total } = await queryView(slug, clientId, limit, offset);
  const body = {
    view: slug,
    client_id: clientId,
    materialized: v.materialized,
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
  // Materialized muda só no refresh → TTL um pouco maior; normal usa o padrão.
  cacheSet(cacheKey, body, v.materialized ? config.cacheTtlSeconds() * 5 : config.cacheTtlSeconds());
  return json(body);
});

// PUT /api/views/:slug — atualiza a definição (admin).
export const PUT = withAdmin(async (req, { params }) => {
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") return error("Body inválido", 422);
  try {
    const row = await upsertView({
      slug: params.slug,
      name: String(b.name ?? params.slug).trim(),
      sql: String(b.sql ?? ""),
      materialized: Boolean(b.materialized ?? false),
      refresh_interval_minutes: b.refresh_interval_minutes != null ? Number(b.refresh_interval_minutes) : undefined,
      client_id: b.client_id ? String(b.client_id) : null,
    });
    return json(row);
  } catch (e) {
    return error(e instanceof Error ? e.message : "Falha ao atualizar view", 400);
  }
});

// DELETE /api/views/:slug — remove a view + o objeto no banco (admin).
export const DELETE = withAdmin(async (_req, { params }) => {
  await deleteView(params.slug);
  return json({ deleted: params.slug });
});
