// Núcleo puro del procesamiento de avisos SMS: sin "server-only" ni
// imports "@/..." para poder testearlo en directo con node --test,
// inyectando un `db`/`provider` en memoria. onStreetSmsService.js es el
// envoltorio real que provee los valores por defecto (Supabase real,
// proveedor resuelto por SMS_PROVIDER) para el resto de la aplicación.
import { publicSmsMessage } from "./onStreetSms.mjs";

// Reclama un aviso PENDING pasando su estado a PROCESSING mediante un
// UPDATE condicional (`where id=X and status='PENDING'`). Si dos
// ejecuciones del scheduler leen la misma fila y ambas intentan
// reclamarla, solo una de las dos actualiza una fila real — la otra
// actualiza cero filas y se salta el envío. Así se garantiza que un mismo
// recordatorio nunca dispare dos SMS, sin necesidad de un lock externo.
async function claimNotification(db, id) {
  const claim = await db
    .from("on_street_pilot_notifications")
    .update({ status: "PROCESSING", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "PENDING")
    .select("id,phone_normalized,message")
    .maybeSingle();
  if (claim.error) throw claim.error;
  return claim.data;
}

export async function processDueOnStreetSms({ origin, provider, db, now = new Date().toISOString() }) {
  const { data, error } = await db
    .from("on_street_pilot_notifications")
    .select("id")
    .eq("status", "PENDING")
    .lte("scheduled_at", now)
    .order("scheduled_at")
    .limit(100);
  if (error) throw error;

  const results = [];
  for (const row of data || []) {
    const claimed = await claimNotification(db, row.id);
    if (!claimed) continue; // otra ejecución ya la reclamó primero

    const message = publicSmsMessage(origin, claimed.message);
    const sentAt = new Date().toISOString();
    let result;
    try {
      result = await provider.send({ to: claimed.phone_normalized, message });
    } catch (cause) {
      result = { ok: false, errorCode: cause.code || "PROVIDER_ERROR" };
    }

    const values = result.ok
      ? {
          status: "SENT",
          sent_at: sentAt,
          accepted_at: sentAt,
          error_code: null,
          provider: provider.name,
          provider_message_id: result.providerMessageId || null,
          provider_status: result.providerStatus ?? null,
          provider_description: result.providerDescription ?? null,
        }
      : {
          status: "FAILED",
          error_code: result.errorCode || "PROVIDER_ERROR",
          provider: provider.name,
          provider_status: result.providerStatus ?? null,
          provider_description: result.providerDescription ?? null,
        };

    const update = await db
      .from("on_street_pilot_notifications")
      .update({ ...values, attempts: 1, updated_at: new Date().toISOString() })
      .eq("id", claimed.id)
      .eq("status", "PROCESSING")
      .select("id,status")
      .maybeSingle();
    if (update.error) throw update.error;
    if (update.data) results.push(update.data);
  }
  return results;
}

// Consulta el estado real de entrega (DLR) de los avisos ya enviados que
// todavía no tienen delivered_at. No confunde "SENT" (el proveedor aceptó
// el envío) con "entregado" — solo marca delivered_at cuando
// checkStatus() confirma deliveryState==="DELIVERED". Los avisos
// simulados no tienen checkStatus (nada real que consultar) y se omiten.
export async function processOnStreetSmsDeliveryStatus({ provider, db, limit = 100 }) {
  if (typeof provider.checkStatus !== "function") return [];

  const { data, error } = await db
    .from("on_street_pilot_notifications")
    .select("id,provider_message_id")
    .eq("status", "SENT")
    .is("delivered_at", null)
    .not("provider_message_id", "is", null)
    .limit(limit);
  if (error) throw error;

  const results = [];
  for (const row of data || []) {
    let status;
    try {
      status = await provider.checkStatus({ providerMessageId: row.provider_message_id });
    } catch {
      continue; // error transitorio de consulta: se reintenta en la próxima corrida, no se pierde el registro
    }
    const patch = { provider_status: status.providerStatus ?? null, provider_description: status.providerDescription ?? null, updated_at: new Date().toISOString() };
    if (status.deliveryState === "DELIVERED") patch.delivered_at = new Date().toISOString();
    const update = await db.from("on_street_pilot_notifications").update(patch).eq("id", row.id).select("id,delivered_at").maybeSingle();
    if (update.error) throw update.error;
    if (update.data) results.push(update.data);
  }
  return results;
}
