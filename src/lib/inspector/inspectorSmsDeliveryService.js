import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { resolveSmsProvider } from "@/lib/onStreetSmsProvider";
import {
  getInspectorSmsReportDetail,
  listPendingInspectorSmsDeliveryChecks,
  persistInspectorSmsDeliveryStatus,
} from "./inspectorRepository";

function error(code, status = 400) {
  const e = new Error(code);
  e.code = code;
  e.status = status;
  return e;
}

// TAREA 8, "Actualizar estado": consulta DLR para UNA fiscalización, por su
// id. NUNCA envía un SMS (provider.checkStatus, nunca provider.send), NUNCA
// vuelve a llamar register_on_street_inspection, NUNCA toca sms_status/
// sms_sent_at/sms_provider_message_id -- solo persiste las 3 columnas de
// entrega (persistInspectorSmsDeliveryStatus). Si el proveedor activo no
// soporta consulta de estado (SIMULATED: checkStatus=null, ver
// onStreetSmsProviderCore.mjs), se informa como tal en vez de fallar
// silencioso o inventar un resultado.
//
// scope (RBAC, agregado el mismo día tras revisión): se exige explícito,
// nunca tiene un valor por defecto -- un llamador que "olvide" pasarlo
// falla ruidosamente en vez de caer silenciosamente a alcance global. Se
// reenvía tal cual a getInspectorSmsReportDetail: si la fiscalización no
// está en el alcance del llamador, INSPECTION_NOT_FOUND (mismo código que
// "no existe" -- nunca se distingue una de otra), y por lo tanto
// persistInspectorSmsDeliveryStatus abajo NUNCA se alcanza a llamar sobre
// una fila fuera de alcance.
export async function checkInspectorSmsDelivery(id, db = getSupabaseAdminClient(), provider = resolveSmsProvider(), scope) {
  if (!scope) throw error("SCOPE_REQUIRED", 500);
  const row = await getInspectorSmsReportDetail(id, db, scope);
  if (!row) throw error("INSPECTION_NOT_FOUND", 404);
  if (row.sms_status !== "SENT" || !row.sms_provider_message_id) throw error("SMS_NOT_ACCEPTED_BY_PROVIDER", 409);
  if (typeof provider.checkStatus !== "function") throw error("PROVIDER_CHECK_STATUS_UNAVAILABLE", 503);

  const status = await provider.checkStatus({ providerMessageId: row.sms_provider_message_id });
  const persisted = await persistInspectorSmsDeliveryStatus(id, {
    smsDeliveryStatus: status.deliveryState,
    smsDeliveryDescription: status.providerDescription ?? null,
  }, db);
  return persisted;
}

// TAREA 8, "Actualizar pendientes": mismo consulta, pero para el lote de
// mensajes SENT sin estado DLR final todavía (ver
// listPendingInspectorSmsDeliveryChecks). Un fallo transitorio en UNA
// consulta no detiene el resto del lote -- se reintenta en la próxima
// corrida (mismo criterio que processOnStreetSmsDeliveryStatus en
// onStreetSmsCore.mjs para el flujo de avisos T-15, aunque este es un lote
// disparado a demanda por el usuario, no un cron -- ver TAREA 8 del
// informe: "no implementar cron nuevo sin justificarlo").
export async function checkPendingInspectorSmsDeliveries(db = getSupabaseAdminClient(), provider = resolveSmsProvider(), limit = 50, scope) {
  if (!scope) throw error("SCOPE_REQUIRED", 500);
  if (typeof provider.checkStatus !== "function") throw error("PROVIDER_CHECK_STATUS_UNAVAILABLE", 503);
  const pending = await listPendingInspectorSmsDeliveryChecks(db, limit, scope);
  const results = [];
  for (const row of pending) {
    try {
      const status = await provider.checkStatus({ providerMessageId: row.sms_provider_message_id });
      const persisted = await persistInspectorSmsDeliveryStatus(row.id, {
        smsDeliveryStatus: status.deliveryState,
        smsDeliveryDescription: status.providerDescription ?? null,
      }, db);
      results.push(persisted);
    } catch {
      continue; // error transitorio de consulta: se reintenta en la próxima corrida, no se pierde el registro
    }
  }
  return results;
}
