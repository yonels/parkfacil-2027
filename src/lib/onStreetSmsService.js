import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { resolveSmsProvider } from "./onStreetSmsProvider";
import { processDueOnStreetSms as processDueOnStreetSmsCore, processOnStreetSmsDeliveryStatus as processOnStreetSmsDeliveryStatusCore } from "./onStreetSmsCore.mjs";

// Envoltorio real para el resto de la aplicación: provee los valores por
// defecto (Supabase real, proveedor resuelto por SMS_PROVIDER) sobre la
// lógica pura de onStreetSmsCore.mjs. Los parámetros siguen pudiendo
// sobreescribirse (usado hoy por los tests que ya llaman a estas mismas
// firmas contra la lógica del núcleo).
export async function processDueOnStreetSms({ origin, provider = resolveSmsProvider(), db = getSupabaseAdminClient(), now } = {}) {
  return processDueOnStreetSmsCore({ origin, provider, db, now });
}

export async function processOnStreetSmsDeliveryStatus({ provider = resolveSmsProvider(), db = getSupabaseAdminClient(), limit } = {}) {
  return processOnStreetSmsDeliveryStatusCore({ provider, db, limit });
}
