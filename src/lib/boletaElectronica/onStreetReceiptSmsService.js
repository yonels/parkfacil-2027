import "server-only";
import { sendSms } from "@/lib/sms/smsCenterService";
import { buildIdempotencyKey } from "@/lib/sms/smsCenterCore.mjs";
import { resolveReceiptSmsSiteBaseUrl, buildReceiptSmsMessage } from "./onStreetReceiptSmsCore.mjs";

// Avisa por SMS que ya está la boleta de un pago On Street
// (SOL-2026-11-12-004, etapa 3 + petición del usuario del 2026-11-14).
// Se llama DESPUÉS de emitir la boleta (nunca antes, nunca bloquea ni
// revierte el pago ni la boleta ya emitida): "mejor esfuerzo", un fallo
// acá solo se registra. Usa el centro de SMS general (sendSms,
// smsCenterService.js) -- no el sistema de avisos de vencimiento
// (on_street_pilot_notifications), que es un flujo aparte, específico de
// sesiones por vencer.
export async function sendOnStreetReceiptSms({ intent, companyId }) {
  if (!intent?.phone_normalized || !intent?.license_plate_normalized) return null;
  try {
    const baseUrl = resolveReceiptSmsSiteBaseUrl();
    const message = buildReceiptSmsMessage({ plate: intent.license_plate_normalized, baseUrl });
    return await sendSms({
      module: "ON_STREET",
      messageType: "RECEIPT_READY",
      phone: intent.phone_normalized,
      body: message,
      idempotencyKey: buildIdempotencyKey("receipt-sms", intent.id),
      parkingId: intent.parking_id,
      companyId: companyId || null,
      eventSource: "SYSTEM",
    });
  } catch (error) {
    console.error("[on-street-receipt-sms] failed", { intentId: intent?.id, code: error?.code, message: error?.message });
    return null;
  }
}
