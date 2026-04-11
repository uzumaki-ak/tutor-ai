// Supabase client initialization
// Browser client for hooks; server client for API routes

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

// Lazy singleton browser client (avoids build-time crashes if envs are missing)
export function getBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  browserClient = createClient(url, anonKey);
  return browserClient;
}

// Server-side client using service role key (for API routes only)
export function getServiceClient() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceRoleKey);
}
