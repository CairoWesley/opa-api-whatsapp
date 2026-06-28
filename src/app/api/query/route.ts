import { withAdmin, json, error } from "@/lib/http";
import { readOnlyQuery } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/query { sql, limit? } — roda uma query SOMENTE LEITURA no banco.
// Disponível p/ admin e gestor (testar query no painel). Transação read-only
// + timeout: qualquer escrita/DDL falha.
export const POST = withAdmin(async (req) => {
  const b = await req.json().catch(() => null);
  const raw = String(b?.sql ?? "").trim();
  if (!raw) return error("Informe a query (SQL).", 422);

  // Só uma instrução, e só SELECT/WITH.
  const stmts = raw.replace(/;\s*$/, "").split(";").map((s) => s.trim()).filter(Boolean);
  if (stmts.length !== 1) return error("Envie apenas UMA instrução SQL.", 400);
  if (!/^(select|with)\b/i.test(stmts[0])) return error("Apenas SELECT/WITH são permitidos.", 400);

  const limit = Math.min(Math.max(Number(b?.limit ?? 200), 1), 1000);
  try {
    const r = await readOnlyQuery(stmts[0], limit);
    return json(r);
  } catch (e) {
    return error(`Erro na query: ${e instanceof Error ? e.message : e}`, 400);
  }
});
