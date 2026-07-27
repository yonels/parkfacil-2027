import "server-only";
import { createClient } from "@supabase/supabase-js";

export class SupabaseConfigurationError extends Error {
  constructor() {
    super("Supabase no está configurado en este entorno.");
    this.name = "SupabaseConfigurationError";
  }
}

function getEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new SupabaseConfigurationError();
  }

  return value;
}

export function isSupabaseConfigurationError(error) {
  return error instanceof SupabaseConfigurationError;
}

let cachedClient = null;

export function getSupabaseAdminClient() {
  if (cachedClient) {
    return cachedClient;
  }

  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  cachedClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedClient;
}
