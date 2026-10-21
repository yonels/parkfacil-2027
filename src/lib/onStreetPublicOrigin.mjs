// Dominio público canónico del flujo QR On-Street (landing, creación de
// Webpay, retorno/comprobante, enlaces SMS T-15).
//
// Incidente 2026-08-26: una contratación real iniciada desde
// onstreet.parkfacilapp.cl volvió, tras Webpay, a parkfacil-2027.vercel.app
// -- porque payment-intents/[token]/webpay/route.js y webpay/return/route.js
// resolvían el origin con `process.env.PARKFACIL_PUBLIC_BASE_URL || url.origin`,
// y esa variable (genérica, compartida con otros usos que no son On-Street)
// está configurada en Production apuntando al alias *.vercel.app. El mismo
// patrón alimentaba también el enlace de los SMS T-15 (onStreetSmsService.js).
//
// Esta función centraliza la resolución: un origin configurado explícitamente
// para On-Street (ON_STREET_PUBLIC_BASE_URL) tiene prioridad; en producción,
// si no hay override, el dominio canónico fijo evita depender de qué alias
// sirvió la petición (o, en el caso del cron de SMS, de que no hay ningún
// alias real involucrado). Fuera de producción (dev/tests), sin override,
// se usa el origin real de la petición -- así `localhost:3000` sigue
// funcionando exactamente igual que antes.
export const ON_STREET_CANONICAL_ORIGIN = "https://onstreet.parkfacilapp.cl";

export function resolveOnStreetPublicOrigin({ configuredOrigin = process.env.ON_STREET_PUBLIC_BASE_URL, requestOrigin, nodeEnv = process.env.NODE_ENV } = {}) {
  const configured = String(configuredOrigin || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  if (nodeEnv === "production") return ON_STREET_CANONICAL_ORIGIN;
  return String(requestOrigin || "").trim().replace(/\/$/, "");
}
