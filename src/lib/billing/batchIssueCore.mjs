// Facturación en lote (SOL-2026-11-05-005, F2; pedido del usuario 2026-11-06: «debes poder generar las facturas
// en lotes», como «Empresas a facturar» de EasyDoc). Código puro: validación y pasos por estado.

export const MAX_BATCH_SIZE = 50;
// Haulmer limita a 3 solicitudes por segundo y 100 por minuto (documentación OpenFactura).
export const BATCH_PAUSE_MS = 700;

export class BatchIssueError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BatchIssueError";
    this.code = code;
    this.status = 422;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateBatchInput(input = {}) {
  const ids = [...new Set((Array.isArray(input.ids) ? input.ids : []).map((id) => String(id || "").trim()))];
  if (!ids.length) throw new BatchIssueError("BATCH_EMPTY", "Selecciona al menos una prefactura.");
  if (ids.length > MAX_BATCH_SIZE) throw new BatchIssueError("BATCH_TOO_LARGE", `Se pueden facturar hasta ${MAX_BATCH_SIZE} prefacturas por lote.`);
  if (ids.some((id) => !UUID.test(id))) throw new BatchIssueError("BATCH_ID_INVALID", "Hay prefacturas no válidas en la selección.");
  const invoiceDate = String(input.invoiceDate || "").trim();
  if (!DATE.test(invoiceDate) || Number.isNaN(new Date(`${invoiceDate}T00:00:00Z`).getTime())) throw new BatchIssueError("BATCH_DATE_INVALID", "La fecha de emisión no es válida.");
  return { ids, invoiceDate };
}

// Pasos que le faltan a una prefactura para quedar emitida, según su estado actual.
export function stepsFor(status) {
  switch (status) {
    case "CALCULATED": return ["REVIEW", "APPROVE", "READY", "ISSUE"];
    case "UNDER_REVIEW": return ["APPROVE", "READY", "ISSUE"];
    case "APPROVED": return ["READY", "ISSUE"];
    case "READY_TO_ISSUE": return ["ISSUE"];
    case "ISSUED": throw new BatchIssueError("PREINVOICE_ALREADY_ISSUED", "Ya está facturada.");
    case "ISSUING": throw new BatchIssueError("PREINVOICE_ISSUING", "Su emisión está en curso.");
    case "CANCELLED": throw new BatchIssueError("PREINVOICE_CANCELLED", "Está anulada.");
    default: throw new BatchIssueError("PREINVOICE_STATUS_INVALID", `No se puede facturar en estado ${status}.`);
  }
}

export function batchSummary(results) {
  const issued = results.filter((item) => item.ok && item.documentStatus === "ISSUED").length;
  const pending = results.filter((item) => item.ok && item.documentStatus !== "ISSUED").length;
  const failed = results.filter((item) => !item.ok).length;
  return { total: results.length, issued, pending, failed };
}
