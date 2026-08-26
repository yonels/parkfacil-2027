import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { resolveSmsProvider } from "./onStreetSmsProvider";
import { processDueOnStreetSms as processDueOnStreetSmsCore, processOnStreetSmsDeliveryStatus as processOnStreetSmsDeliveryStatusCore } from "./onStreetSmsCore.mjs";
import { resolveSmsPublicOrigin } from "./onStreetSms.mjs";
import { resolveOnStreetPublicOrigin } from "./onStreetPublicOrigin.mjs";
import { isEligibleOnStreetSmsNotification } from "./onStreetSmsEligibility.mjs";

// Envoltorio real para el resto de la aplicación: provee los valores por
// defecto (Supabase real, proveedor resuelto por SMS_PROVIDER) sobre la
// lógica pura de onStreetSmsCore.mjs. Los parámetros siguen pudiendo
// sobreescribirse (usado hoy por los tests que ya llaman a estas mismas
// firmas contra la lógica del núcleo).
//
// El enlace del SMS T-15 usa el mismo dominio canónico On-Street que el
// resto del flujo (resolveOnStreetPublicOrigin) en vez de
// PARKFACIL_PUBLIC_BASE_URL directamente -- antes de este cambio, el cron
// (sin ningún alias de usuario real detrás) heredaba el mismo valor
// genérico que causó el incidente de Webpay del 2026-08-26.
export async function processDueOnStreetSms({ origin, provider = resolveSmsProvider(), db = getSupabaseAdminClient(), now } = {}) {
  const canonicalOrigin = resolveOnStreetPublicOrigin({ requestOrigin: origin });
  const publicOrigin = resolveSmsPublicOrigin({ configuredOrigin: canonicalOrigin });
  return processDueOnStreetSmsCore({ origin: publicOrigin, provider, db, now, eligibilityCheck: (notification, at) => isEligibleOnStreetSmsNotification(db, notification, at) });
}

export async function processOnStreetSmsDeliveryStatus({ provider = resolveSmsProvider(), db = getSupabaseAdminClient(), limit } = {}) {
  return processOnStreetSmsDeliveryStatusCore({ provider, db, limit });
}
