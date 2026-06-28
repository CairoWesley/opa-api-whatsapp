// Sessão do dashboard: hash de senha (scrypt) + cookie assinado (HMAC).
// Sem dependência externa — tudo via node:crypto. Stateless: o cookie carrega
// {uid, username, exp} assinado; não há tabela de sessões.
import "server-only";
import {
  scryptSync,
  randomBytes,
  timingSafeEqual,
  createHmac,
} from "node:crypto";
import { config } from "./config";

export const SESSION_COOKIE = "opa_session";

// ── Senha (scrypt) ──────────────────────────────────────────────────────────
// Formato armazenado: scrypt$<saltB64>$<hashB64>
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  const actual = scryptSync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// ── Cookie de sessão (HMAC-SHA256) ──────────────────────────────────────────
type SessionPayload = { uid: string; username: string; exp: number };

const b64url = (b: Buffer) => b.toString("base64url");

function sign(data: string): string {
  return createHmac("sha256", config.sessionSecret()).update(data).digest("base64url");
}

export function signSession(uid: string, username: string): { token: string; maxAge: number } {
  const ttlSec = config.sessionTtlHours() * 3600;
  const payload: SessionPayload = {
    uid,
    username,
    exp: Math.floor(Date.now() / 1000) + ttlSec,
  };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const token = `${body}.${sign(body)}`;
  return { token, maxAge: ttlSec };
}

export function verifySession(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(body);
  // comparação em tempo constante
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// Extrai o cookie de sessão do header Cookie da request.
export function readSessionCookie(req: Request): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) return decodeURIComponent(v.join("="));
  }
  return null;
}
