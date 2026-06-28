// Cache TTL em memória (por instância) para acelerar leituras.
// Para múltiplas réplicas, troque o store por Redis mantendo a interface.
import { config } from "./config";

type Entry = { value: unknown; expiresAt: number };
const store = new Map<string, Entry>();

// Chave canônica da read API. Rota e cache-warm usam ESTA função para bater.
// Inclui filtros + ordenação — senão filtros diferentes serviriam dados errados.
export type DataKeyParts = {
  clientId: string | null;
  resource: string;
  limit: number;
  offset: number;
  orderBy: string;
  orderDesc: boolean;
  filters: { field: string; op: string; value: string }[];
};

export function buildDataKey(p: DataKeyParts): string {
  const f = p.filters
    .map((x) => `${x.field}${x.op}${x.value}`)
    .sort()
    .join("|");
  return `data:${p.clientId ?? "*"}:${p.resource}:${p.limit}:${p.offset}:${p.orderBy}:${p.orderDesc}:${f}`;
}

export function cacheGet<T>(key: string): T | null {
  const e = store.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    store.delete(key);
    return null;
  }
  return e.value as T;
}

export function cacheSet(key: string, value: unknown, ttlSeconds?: number): void {
  const ttl = (ttlSeconds ?? config.cacheTtlSeconds()) * 1000;
  store.set(key, { value, expiresAt: Date.now() + ttl });
}

export function cacheClear(): void {
  store.clear();
}

export function cacheInvalidatePrefix(prefix: string): number {
  let n = 0;
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) {
      store.delete(k);
      n++;
    }
  }
  return n;
}

export function cacheStats() {
  return { size: store.size, ttl: config.cacheTtlSeconds() };
}
