// Tokens de acesso à API do cliente. Só sha256(token) é guardado.
import { randomBytes, createHash } from "node:crypto";
import { q, q1, exec } from "./db";

export type ApiTokenRow = {
  id: string;
  name: string;
  client_id: string | null;
  token_prefix: string;
  scopes: string[];
  active: boolean;
  created_at: string;
  last_used_at: string | null;
};

const COLS = "id, name, client_id, token_prefix, scopes, active, created_at, last_used_at";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function listTokens(): Promise<ApiTokenRow[]> {
  return q<ApiTokenRow>(`select ${COLS} from api_tokens order by created_at desc`);
}

export async function createToken(name: string, scopes: string[], clientId: string | null): Promise<{ token: string; row: ApiTokenRow }> {
  const token = `opa_${randomBytes(24).toString("hex")}`;
  const row = await q1<ApiTokenRow>(
    `insert into api_tokens (name, client_id, token_prefix, token_hash, scopes)
     values ($1,$2,$3,$4,$5) returning ${COLS}`,
    [name, clientId, token.slice(0, 12), hashToken(token), scopes.length ? scopes : ["data:read"]],
  );
  return { token, row: row as ApiTokenRow };
}

export async function deleteToken(id: string): Promise<void> {
  await exec(`delete from api_tokens where id = $1`, [id]);
}

export async function setTokenActive(id: string, active: boolean): Promise<void> {
  await exec(`update api_tokens set active = $1 where id = $2`, [active, id]);
}

export async function verifyApiToken(token: string): Promise<ApiTokenRow | null> {
  if (!token.startsWith("opa_")) return null;
  const row = await q1<ApiTokenRow>(`select ${COLS} from api_tokens where token_hash = $1 and active = true`, [hashToken(token)]);
  if (!row) return null;
  void exec(`update api_tokens set last_used_at = now() where id = $1`, [row.id]).catch(() => {});
  return row;
}
