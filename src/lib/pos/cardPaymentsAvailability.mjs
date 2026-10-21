// Pago con tarjeta (TUU) en el POS: habilitado o no según el ambiente (SOL-2026-10-18-001, decisión D2).
// En producción queda apagado hasta validar el flujo con tarjeta (SOL-2026-10-11-001); se enciende con
// POS_CARD_PAYMENTS_ENABLED=true. En Preview (QA) y local sigue disponible. POS_CARD_PAYMENTS_ENABLED=false
// lo apaga en cualquier ambiente.
export function posCardPaymentsEnabled(env = process.env) {
  const flag = String(env?.POS_CARD_PAYMENTS_ENABLED ?? "").trim().toLowerCase();
  if (flag === "true") return true;
  if (flag === "false") return false;
  return String(env?.VERCEL_ENV ?? "").trim().toLowerCase() !== "production";
}
