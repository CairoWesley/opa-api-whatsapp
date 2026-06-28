// Validação leve dos payloads de cliente (sem dependência externa).
const SLUG_RE = /^[a-z0-9][a-z0-9\-_]*$/;

export type ClientInput = {
  slug: string;
  name: string;
  base_url: string;
  token: string;
  company_id: string | null;
  active: boolean;
  sync_interval_minutes: number;
  lookback_days: number;
  extra_filters: Record<string, unknown>;
};

function normalizeBaseUrl(v: unknown): string {
  if (typeof v !== "string" || !/^https?:\/\//.test(v.trim())) {
    throw new Error("base_url deve começar com http:// ou https://");
  }
  return v.trim().replace(/\/+$/, "");
}

export function parseClientCreate(body: any): ClientInput {
  if (!body || typeof body !== "object") throw new Error("Body inválido");
  const slug = String(body.slug ?? "").trim();
  if (!SLUG_RE.test(slug)) throw new Error("slug inválido (use a-z, 0-9, - e _)");
  const name = String(body.name ?? "").trim();
  if (!name) throw new Error("name é obrigatório");
  const token = String(body.token ?? "").trim();
  if (token.length < 10) throw new Error("token inválido");
  return {
    slug,
    name,
    base_url: normalizeBaseUrl(body.base_url),
    token,
    company_id: body.company_id ? String(body.company_id) : null,
    active: body.active ?? true,
    sync_interval_minutes: Number(body.sync_interval_minutes ?? 30),
    lookback_days: Number(body.lookback_days ?? 30),
    extra_filters: body.extra_filters ?? {},
  };
}

// Patch parcial: só valida campos presentes.
export function parseClientUpdate(body: any): Record<string, unknown> {
  if (!body || typeof body !== "object") throw new Error("Body inválido");
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = String(body.name).trim();
  if (body.base_url !== undefined) patch.base_url = normalizeBaseUrl(body.base_url);
  if (body.company_id !== undefined) patch.company_id = body.company_id ? String(body.company_id) : null;
  if (body.active !== undefined) patch.active = Boolean(body.active);
  if (body.sync_interval_minutes !== undefined)
    patch.sync_interval_minutes = Number(body.sync_interval_minutes);
  if (body.lookback_days !== undefined) patch.lookback_days = Number(body.lookback_days);
  if (body.extra_filters !== undefined) patch.extra_filters = body.extra_filters;
  // token tratado à parte (criptografia) no handler
  return patch;
}
