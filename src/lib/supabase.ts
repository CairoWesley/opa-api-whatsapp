// Cliente Supabase server-side (service role — bypassa RLS).
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";

let _client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!_client) {
    _client = createClient(config.supabaseUrl(), config.supabaseServiceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}
