import { resolutionText } from "./openFacturaCore.mjs";

// Reglas puras de la boleta del pago en efectivo del POS (SOL-2026-10-20-001).

// Solo pagos en efectivo con monto > $0, en un estacionamiento activo de una
// empresa con API Key cargada. Con tarjeta, TUU entrega su propio voucher.
export function shouldIssueCashBoleta({ stay, settings }) {
  if (!stay || stay.status !== "PAID" || stay.payment_method !== "CASH") return false;
  if (!(Math.round(Number(stay.total_amount)) > 0) || !stay.payment_code) return false;
  if (!settings?.api_key_ciphertext) return false;
  return (settings.enabled_parking_ids || []).includes(stay.parking_id);
}

// RUT con que se emite: el de la empresa; en ambiente Prueba, el RUT emisor de
// prueba si está configurado (las API Keys de desarrollo de Haulmer solo emiten
// con el RUT de su empresa de prueba). En Producción, siempre el de la empresa.
export function emitterRutFor(settings, company) {
  if (settings?.environment === "TEST" && settings?.test_emitter_rut) return settings.test_emitter_rut;
  return company?.rut_number && company?.rut_dv ? `${company.rut_number}-${company.rut_dv}` : "";
}

// Lo que necesitan el POS y el comprobante (sin token ni XML).
export function boletaForReceipt(row) {
  if (!row) return null;
  if (row.status !== "ISSUED") {
    return { status: "FAILED", environment: row.environment || null, errorCode: row.error_code || null, message: "Boleta electrónica pendiente: no se pudo emitir en Haulmer." };
  }
  return {
    status: "ISSUED",
    environment: row.environment,
    folio: row.folio ?? null,
    ted: row.ted || null,
    stampPngBase64: row.stamp_png_base64 || null,
    resolution: resolutionText({ date: row.resolution_date, number: row.resolution_number }),
    netAmount: row.net_amount ?? null,
    taxAmount: row.tax_amount ?? null,
    totalAmount: row.total_amount ?? null,
  };
}
