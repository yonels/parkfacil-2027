// Auditoría de consultas de «Consulte su boleta» (DISENO.md, control C8):
// se registra la patente con hash (nunca en claro) y el resultado, no el
// correo ni ningún otro dato personal.

import { createHash } from "node:crypto";

export function hashPublicReceiptsPlate(plate) {
  return createHash("sha256").update(String(plate || "")).digest("hex");
}

// Fila lista para insertar en public_receipt_queries.
export function buildPublicReceiptsAuditEntry({ plate, resultCount, now = new Date() }) {
  return {
    plate_hash: hashPublicReceiptsPlate(plate),
    result_count: Number.isFinite(Number(resultCount)) ? Number(resultCount) : 0,
    queried_at: now.toISOString(),
  };
}

export function hashPublicReceiptsEmail(email) {
  return createHash("sha256").update(String(email || "").trim().toLowerCase()).digest("hex");
}

// Fila lista para insertar en public_receipt_sends (etapa 6, control C8: el
// destinatario nunca queda en claro).
export function buildPublicReceiptsSendAuditEntry({ plate, email, stayId, result, now = new Date() }) {
  return {
    plate_hash: hashPublicReceiptsPlate(plate),
    email_hash: hashPublicReceiptsEmail(email),
    stay_id: stayId,
    result: String(result || "FAILED"),
    sent_at: now.toISOString(),
  };
}
