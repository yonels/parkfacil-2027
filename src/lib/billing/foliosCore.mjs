// Folios disponibles por tipo de DTE (SOL-2026-11-05-005; pedido del usuario 2026-11-09). Código puro: ordena los
// tipos que usa ParkFacil y marca avisos: amarillo si quedan pocos o vencen pronto, rojo si se agotaron o vencieron.
export const FOLIO_TYPES = Object.freeze({
  33: "Factura electrónica", 34: "Factura exenta", 61: "Nota de crédito", 56: "Nota de débito", 39: "Boleta electrónica", 41: "Boleta exenta", 52: "Guía de despacho",
});
// Los que usa la facturación a clientes (el aviso del Ciclo y del lote solo mira estos).
export const BILLING_FOLIO_TYPES = Object.freeze([33, 61, 56]);
export const LOW_FOLIOS = 50;
export const EXPIRY_WARNING_DAYS = 30;

function daysBetween(from, to) {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${String(to).slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86400000) : null;
}

export function folioLevel({ available, daysLeft }) {
  if (available <= 0 || (daysLeft != null && daysLeft < 0)) return "err";
  if (available < LOW_FOLIOS || (daysLeft != null && daysLeft <= EXPIRY_WARNING_DAYS)) return "warn";
  return "ok";
}

export function folioMessage(row) {
  if (row.available <= 0) return "Sin folios: no se podrá emitir.";
  if (row.daysLeft != null && row.daysLeft < 0) return "Folios vencidos: no se podrá emitir.";
  const parts = [];
  if (row.available < LOW_FOLIOS) parts.push(`quedan solo ${row.available}`);
  if (row.daysLeft != null && row.daysLeft <= EXPIRY_WARNING_DAYS) parts.push(`vencen en ${row.daysLeft} día(s)`);
  return parts.length ? `Atención: ${parts.join(" y ")}.` : "";
}

export function summarizeFolios(list = [], today = new Date().toISOString().slice(0, 10)) {
  // Orden de presentación (las claves numéricas de un objeto se ordenan solas, por eso va explícito).
  const order = [33, 34, 61, 56, 39, 41, 52];
  const rows = list
    .filter((d) => FOLIO_TYPES[Number(d?.dte)])
    .map((d) => {
      const available = Math.max(0, Math.round(Number(d.disponibles) || 0));
      const expires = d.vencimiento ? String(d.vencimiento).slice(0, 10) : null;
      const daysLeft = expires ? daysBetween(today, expires) : null;
      const row = { dte: Number(d.dte), label: FOLIO_TYPES[Number(d.dte)], available, expires, daysLeft };
      return { ...row, level: folioLevel(row), message: folioMessage(row) };
    })
    .sort((a, b) => order.indexOf(a.dte) - order.indexOf(b.dte));
  // Un tipo que usa la facturación y Haulmer no informa: sin folios cargados.
  for (const dte of BILLING_FOLIO_TYPES) if (!rows.some((r) => r.dte === dte)) rows.push({ dte, label: FOLIO_TYPES[dte], available: 0, expires: null, daysLeft: null, level: "err", message: "Haulmer no informa folios para este documento." });
  const billing = rows.filter((r) => BILLING_FOLIO_TYPES.includes(r.dte));
  const worst = billing.some((r) => r.level === "err") ? "err" : billing.some((r) => r.level === "warn") ? "warn" : "ok";
  return { rows, worst, alerts: billing.filter((r) => r.level !== "ok") };
}
