// Retorno al «Ciclo de facturación» (SOL-2026-11-05-005, 2026-11-09): al abrir una pantalla de detalle (servicios,
// prefactura, catálogo…) desde una etapa, se recuerda empresa, período y etapa para volver con un clic. Solo en la
// pestaña del navegador (sessionStorage) y vence a las 2 horas; si el almacenamiento no está disponible, no hace nada.
const KEY = "parkfacil:facturacion:volver-ciclo";
const TTL_MS = 2 * 60 * 60 * 1000;

export function rememberCycleReturn(value) {
  try { window.sessionStorage.setItem(KEY, JSON.stringify({ ...value, at: Date.now() })); } catch { /* sin almacenamiento */ }
}

export function readCycleReturn() {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(KEY) || "null");
    if (!value || !value.companyId || Date.now() - Number(value.at || 0) > TTL_MS) return null;
    return value;
  } catch { return null; }
}

export function forgetCycleReturn() {
  try { window.sessionStorage.removeItem(KEY); } catch { /* sin almacenamiento */ }
}
