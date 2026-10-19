// Cupones y descuentos: visibles o no según el ambiente (SOL-2026-10-19-001). En producción
// quedan ocultos hasta que el canje en el POS esté listo (hoy ningún cliente envía el cupón al
// cobrar); se encienden con COUPONS_ENABLED=true. En Preview (QA) y local siguen disponibles.
// COUPONS_ENABLED=false los apaga en cualquier ambiente. Mismo criterio que D2
// (posCardPaymentsEnabled).
export function couponsEnabled(env = process.env) {
  const flag = String(env?.COUPONS_ENABLED ?? "").trim().toLowerCase();
  if (flag === "true") return true;
  if (flag === "false") return false;
  return String(env?.VERCEL_ENV ?? "").trim().toLowerCase() !== "production";
}

// Valor fijado en el build (next.config.mjs → NEXT_PUBLIC_COUPONS_ENABLED) para que el menú
// del navegador y el proxy decidan igual que las API. Sin valor (pruebas, scripts) se
// considera habilitado. Cambiar COUPONS_ENABLED en Vercel requiere un nuevo despliegue.
export function couponsVisible(value = process.env.NEXT_PUBLIC_COUPONS_ENABLED) {
  return String(value ?? "").trim().toLowerCase() !== "false";
}

export const COUPONS_DISABLED_ERROR = Object.freeze({
  code: "COUPONS_DISABLED",
  error: "Cupones y descuentos no está habilitado en este ambiente.",
});
