import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { resolveSmsProvider } from "@/lib/onStreetSmsProvider";
import { getOnStreetSessionForInspection } from "./inspectorRepository";
import { INSPECTION_OVERDUE_SMS_TEXT } from "./inspectorSms.mjs";

function error(code, status = 400) {
  const e = new Error(code);
  e.code = code;
  e.status = status;
  return e;
}

// Registra una fiscalización real (Etapa 2, §9/§13): SIEMPRE re-deriva la
// sesión y el teléfono desde la base de datos por su id -- nunca confía en
// nada que el cliente afirme sobre el estado actual. Solo un tipo OVERSTAY
// exige una sesión EXPIRED real; NO_SESSION/OTHER no requieren sesión.
//
// Regla crítica (§9): una sesión vencida por sí sola NUNCA envía SMS. Exige
// una confirmación deliberada (vehicleStillPresent===true) además del
// vencimiento -- ambas condiciones se verifican aquí, server-side, nunca
// solo en la UI.
//
// contextParkingId/contextQrLocationId (Etapa 3, §13/§14): cuando NO hay
// sesión (NO_SESSION/OTHER) no hay ningún estacionamiento real del que
// derivar parking_id/qr_location_id -- de ahí el caso real encontrado en
// Etapa 2 ("Sin estacionamiento asignado"). Si el Inspector seleccionó
// dónde está trabajando, se usa ese contexto, pero SIEMPRE re-verificado
// aquí contra la base de datos (nunca se confía en el id recibido sin
// comprobar que existe y, si viene qr_location_id, que pertenece al mismo
// estacionamiento). Para OVERSTAY el contexto llega ignorado: el
// estacionamiento real de la sesión ya es inequívoco y sigue siendo la
// única fuente de verdad.
export async function registerOnStreetInspection(db = getSupabaseAdminClient(), {
  idempotencyKey,
  plate,
  sessionId,
  inspectorUserId,
  inspectionType,
  vehicleStillPresent,
  observations,
  latitude,
  longitude,
  contextParkingId = null,
  contextQrLocationId = null,
}) {
  if (String(idempotencyKey || "").length < 8) throw error("IDEMPOTENCY_KEY_REQUIRED");
  if (!["OVERSTAY", "NO_SESSION", "OTHER"].includes(inspectionType)) throw error("INSPECTION_TYPE_INVALID");
  if (!inspectorUserId) throw error("INSPECTOR_REQUIRED", 401);

  let session = null;
  if (inspectionType === "OVERSTAY") {
    if (!sessionId) throw error("INSPECTION_SESSION_REQUIRED", 409);
    session = await getOnStreetSessionForInspection(sessionId, db);
    // Re-verificado server-side, no confiado del cliente: debe ser
    // exactamente la misma sesión, la misma patente, y seguir EXPIRED en
    // este instante (pudo haberse pagado una extensión entretanto).
    if (!session || session.status !== "EXPIRED" || session.license_plate_normalized !== plate) {
      throw error("INSPECTION_SESSION_NOT_OVERDUE", 409);
    }
  }

  let resolvedParkingId = session?.parking_id || null;
  let resolvedQrLocationId = session?.qr_location_id || null;
  if (!session && contextParkingId) {
    const parkingCheck = await db.from("parkings").select("id").eq("id", contextParkingId).eq("type", "ON_STREET").eq("status", "ACTIVE").maybeSingle();
    if (parkingCheck.error) throw parkingCheck.error;
    if (parkingCheck.data) {
      resolvedParkingId = parkingCheck.data.id;
      if (contextQrLocationId) {
        const locationCheck = await db.from("on_street_qr_locations").select("id,parking_id").eq("id", contextQrLocationId).maybeSingle();
        if (locationCheck.error) throw locationCheck.error;
        if (locationCheck.data && locationCheck.data.parking_id === resolvedParkingId) {
          resolvedQrLocationId = locationCheck.data.id;
        }
      }
    }
  }

  const result = await db.rpc("register_on_street_inspection", {
    p_idempotency_key: String(idempotencyKey),
    p_license_plate: plate,
    p_session_id: session?.id || null,
    p_qr_location_id: resolvedQrLocationId,
    p_parking_id: resolvedParkingId,
    p_inspector_user_id: inspectorUserId,
    p_inspection_type: inspectionType,
    p_vehicle_still_present: Boolean(vehicleStillPresent),
    p_observations: observations ? String(observations).slice(0, 2000) : null,
    p_latitude: Number.isFinite(latitude) ? latitude : null,
    p_longitude: Number.isFinite(longitude) ? longitude : null,
    p_phone_normalized: session?.phone_normalized || null,
  });
  if (result.error) throw result.error;

  const inspection = result.data;
  // El SMS solo se intenta si esta llamada fue la que efectivamente creó el
  // registro (reused=false) y realmente lo requiere -- una repetición
  // idempotente (doble click, reintento) nunca vuelve a intentarlo aquí; la
  // protección definitiva contra un segundo envío igualmente vive en
  // sendInspectionSmsIfNeeded (reclamo atómico PENDING->SENDING).
  if (!inspection.reused && inspection.smsRequired && session?.phone_normalized) {
    // Corrección 2026-08-31: la pantalla de éxito de Inspector debe reflejar
    // el resultado REAL del envío (proveedor SIMULATED vs real, SENT vs
    // FAILED) -- antes esta función devolvía el "smsStatus" tal cual venía
    // de register_on_street_inspection (previo al intento de envío), así
    // que la UI mostraba "Se envió el SMS" incluso cuando el proveedor
    // activo era el simulado. No cambia CUÁNDO ni CÓMO se envía (misma
    // condición exacta de arriba, mismo reclamo atómico dentro de
    // sendInspectionSmsIfNeeded) -- solo se reenvía al llamador el
    // resultado que esa función ya calculaba y hasta ahora se descartaba.
    const smsResult = await sendInspectionSmsIfNeeded(db, { inspectionId: inspection.id, phoneNormalized: session.phone_normalized });
    if (smsResult.attempted) {
      inspection.smsStatus = smsResult.sms_status;
      inspection.smsProvider = smsResult.providerName;
      inspection.smsProviderMessageId = smsResult.sms_provider_message_id ?? null;
    }
  }
  return inspection;
}

// Reclamo atómico (mismo patrón que claimNotification en onStreetSmsCore.mjs):
// un UPDATE condicional sms_status='PENDING'->'SENDING' solo puede ganarlo
// una llamada. Cualquier otra (concurrente, o una repetición que ya vio
// reused=true más arriba) encuentra 0 filas y no reenvía nada.
export async function sendInspectionSmsIfNeeded(db, { inspectionId, phoneNormalized, provider = resolveSmsProvider() }) {
  const claim = await db
    .from("on_street_inspections")
    .update({ sms_status: "SENDING", updated_at: new Date().toISOString() })
    .eq("id", inspectionId)
    .eq("sms_status", "PENDING")
    .select("id")
    .maybeSingle();
  if (claim.error) throw claim.error;
  if (!claim.data) return { attempted: false };

  let result;
  try {
    result = await provider.send({ to: phoneNormalized, message: INSPECTION_OVERDUE_SMS_TEXT });
  } catch (cause) {
    result = { ok: false, errorCode: cause?.code || "PROVIDER_ERROR" };
  }

  const patch = result.ok
    ? { sms_status: "SENT", sms_sent_at: new Date().toISOString(), sms_provider_message_id: result.providerMessageId || null, updated_at: new Date().toISOString() }
    : { sms_status: "FAILED", updated_at: new Date().toISOString() };
  const update = await db.from("on_street_inspections").update(patch).eq("id", inspectionId).select("id,sms_status,sms_sent_at,sms_provider_message_id").maybeSingle();
  if (update.error) throw update.error;
  // providerName (corrección 2026-08-31): quién resolvió realmente el envío
  // ("SIMULATED" o "SENTRALAND", ver onStreetSmsProviderCore.mjs) -- dato ya
  // conocido aquí mismo (el parámetro "provider"), solo se agrega al
  // resultado para que el llamador (y, a través de él, la UI) pueda
  // distinguir un envío simulado de uno real. No cambia nada de la lógica
  // de envío/reclamo de arriba.
  return { attempted: true, sent: Boolean(result.ok), providerName: provider.name, ...update.data };
}
