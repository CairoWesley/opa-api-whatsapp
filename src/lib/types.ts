// Tipos de domínio.

export type ClientRow = {
  id: string;
  slug: string;
  name: string;
  base_url: string;
  company_id: string | null;
  active: boolean;
  insecure_tls: boolean;
  page_size: number | null;
  timeout_ms: number | null;
  sync_interval_minutes: number;
  lookback_days: number;
  blocked_resources: string[];
  disabled_resources: string[];
  resource_access: Record<string, { ok: boolean; code: number; at: string }>;
  extra_filters: Record<string, Record<string, unknown>>;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  created_at: string | null;
  updated_at: string | null;
};

// ClientRow + segredo (uso interno do extractor; nunca exposto via API)
export type ClientSecretRow = ClientRow & { token_encrypted: string };

export type ResourceSyncResult = {
  resource: string;
  status: "ok" | "error";
  records_upserted: number;
  error?: string;
  permission_error?: boolean; // 401/403 → recurso bloqueado até revalidar
};

export type SyncResult = {
  client_id: string;
  client_slug: string;
  status: "ok" | "error" | "scheduled" | "running";
  resources: ResourceSyncResult[];
  total_upserted: number;
};
