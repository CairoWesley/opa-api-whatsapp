// Acesso de dados ao Supabase (CRUD de clientes, upsert de documentos, logs).
import "server-only";
import { supabaseAdmin } from "./supabase";
import { config } from "./config";
import { hashPassword } from "./session";
import type { ClientRow, ClientSecretRow } from "./types";
import type { OpaDoc } from "./opa-client";

export type DashUser = { id: string; username: string; password_hash: string; active: boolean };

const CLIENT_COLUMNS =
  "id, slug, name, base_url, company_id, active, sync_interval_minutes, " +
  "lookback_days, extra_filters, last_synced_at, last_sync_status, " +
  "last_sync_error, created_at, updated_at";

const nowIso = () => new Date().toISOString();

// ── Clientes ────────────────────────────────────────────────────────────────
export async function listClients(active?: boolean): Promise<ClientRow[]> {
  let q = supabaseAdmin().from("opa_clients").select(CLIENT_COLUMNS).order("created_at");
  if (active !== undefined) q = q.eq("active", active);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as ClientRow[];
}

export async function getClient(id: string): Promise<ClientRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("opa_clients")
    .select(CLIENT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as ClientRow) ?? null;
}

export async function getClientSecret(id: string): Promise<ClientSecretRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("opa_clients")
    .select(CLIENT_COLUMNS + ", token_encrypted")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as ClientSecretRow) ?? null;
}

export async function insertClient(row: Record<string, unknown>): Promise<ClientRow> {
  const { data, error } = await supabaseAdmin()
    .from("opa_clients")
    .insert(row)
    .select(CLIENT_COLUMNS)
    .single();
  if (error) throw error;
  return data as unknown as ClientRow;
}

export async function updateClient(
  id: string,
  patch: Record<string, unknown>,
): Promise<ClientRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("opa_clients")
    .update(patch)
    .eq("id", id)
    .select(CLIENT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as ClientRow) ?? null;
}

export async function deleteClient(id: string): Promise<void> {
  const { error } = await supabaseAdmin().from("opa_clients").delete().eq("id", id);
  if (error) throw error;
}

export async function setSyncState(
  id: string,
  status: string,
  errorMsg: string | null = null,
  markSynced = false,
): Promise<void> {
  const patch: Record<string, unknown> = { last_sync_status: status, last_sync_error: errorMsg };
  if (markSynced) patch.last_synced_at = nowIso();
  const { error } = await supabaseAdmin().from("opa_clients").update(patch).eq("id", id);
  if (error) throw error;
}

// ── Documentos ──────────────────────────────────────────────────────────────
export async function upsertDocuments(
  clientId: string,
  resource: string,
  docs: OpaDoc[],
): Promise<number> {
  if (docs.length === 0) return 0;
  const synced = nowIso();
  const rows = docs
    .map((d) => {
      const externalId = String(d._id ?? d.id ?? "");
      if (!externalId) return null;
      return { client_id: clientId, resource, external_id: externalId, raw: d, synced_at: synced };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  if (rows.length === 0) return 0;
  const { error } = await supabaseAdmin()
    .from("opa_documents")
    .upsert(rows, { onConflict: "client_id,resource,external_id" });
  if (error) throw error;
  return rows.length;
}

export async function queryDocuments(
  clientId: string | null,
  resource: string,
  limit: number,
  offset: number,
  orderDesc: boolean,
): Promise<{ rows: unknown[]; total: number }> {
  let q = supabaseAdmin()
    .from("opa_documents")
    .select("id, client_id, resource, external_id, raw, synced_at", { count: "exact" })
    .eq("resource", resource);
  if (clientId) q = q.eq("client_id", clientId);
  const { data, error, count } = await q
    .order("synced_at", { ascending: !orderDesc })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

// ── Usuários do dashboard ───────────────────────────────────────────────────
export async function getUserByUsername(username: string): Promise<DashUser | null> {
  const { data, error } = await supabaseAdmin()
    .from("dashboard_users")
    .select("id, username, password_hash, active")
    .eq("username", username)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as DashUser) ?? null;
}

export async function countUsers(): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from("dashboard_users")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

export async function createUser(username: string, passwordHash: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("dashboard_users")
    .insert({ username, password_hash: passwordHash });
  if (error) throw error;
}

export async function touchUserLogin(id: string): Promise<void> {
  await supabaseAdmin().from("dashboard_users").update({ last_login_at: nowIso() }).eq("id", id);
}

// Cria o 1º admin a partir das env DASHBOARD_DEFAULT_* se a tabela estiver vazia.
// Idempotente e seguro: só age quando não há nenhum usuário.
export async function ensureSeedUser(): Promise<void> {
  const user = config.defaultDashUser();
  const pass = config.defaultDashPassword();
  if (!user || !pass) return;
  if ((await countUsers()) > 0) return;
  try {
    await createUser(user, hashPassword(pass));
  } catch {
    /* corrida: outro processo semeou primeiro — ignora */
  }
}

// ── Logs ────────────────────────────────────────────────────────────────────
export async function insertSyncLog(
  clientId: string,
  resource: string,
  status: string,
  records: number,
  errorMsg: string | null,
): Promise<void> {
  await supabaseAdmin().from("opa_sync_logs").insert({
    client_id: clientId,
    resource,
    status,
    records_upserted: records,
    error: errorMsg,
    finished_at: nowIso(),
  });
}
