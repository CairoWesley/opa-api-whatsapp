// Tokens de acesso à API do cliente. Guardamos só sha256(token); o valor em
// claro só existe no momento da geração.
import { randomBytes, createHash } from "node:crypto";
import { supabaseAdmin } from "./supabase";

export type ApiTokenRow = {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  active: boolean;
  created_at: string;
  last_used_at: string | null;
};

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Gera um token novo: `opa_<48 hex>`. Retorna o valor em claro + linha p/ inserir.
export function generateToken(name: string, scopes: string[]) {
  const secret = randomBytes(24).toString("hex");
  const token = `opa_${secret}`;
  return {
    token,
    row: {
      name,
      token_prefix: token.slice(0, 12),
      token_hash: hashToken(token),
      scopes: scopes.length ? scopes : ["data:read"],
    },
  };
}

export async function listTokens(): Promise<ApiTokenRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("api_tokens")
    .select("id, name, token_prefix, scopes, active, created_at, last_used_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ApiTokenRow[];
}

export async function createToken(name: string, scopes: string[]): Promise<{ token: string; row: ApiTokenRow }> {
  const { token, row } = generateToken(name, scopes);
  const { data, error } = await supabaseAdmin()
    .from("api_tokens")
    .insert(row)
    .select("id, name, token_prefix, scopes, active, created_at, last_used_at")
    .single();
  if (error) throw error;
  return { token, row: data as unknown as ApiTokenRow };
}

export async function deleteToken(id: string): Promise<void> {
  const { error } = await supabaseAdmin().from("api_tokens").delete().eq("id", id);
  if (error) throw error;
}

export async function setTokenActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabaseAdmin().from("api_tokens").update({ active }).eq("id", id);
  if (error) throw error;
}

// Valida um token de API pelo hash. Retorna a linha (sem hash) se ativo.
export async function verifyApiToken(token: string): Promise<ApiTokenRow | null> {
  if (!token.startsWith("opa_")) return null;
  const { data, error } = await supabaseAdmin()
    .from("api_tokens")
    .select("id, name, token_prefix, scopes, active, created_at, last_used_at")
    .eq("token_hash", hashToken(token))
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  // marca uso (best-effort, sem await crítico)
  void supabaseAdmin().from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", (data as ApiTokenRow).id);
  return data as unknown as ApiTokenRow;
}
