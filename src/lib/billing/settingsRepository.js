import "server-only";
import { fromSettingsRow } from "./settingsCore.mjs";

// Configuración de facturación (SOL-2026-11-05-005, F1.4). Una sola fila (id = 1).
const COLUMNS = "issuer_business_name,issuer_rut_number,issuer_rut_dv,issuer_activity,issuer_activity_code,issuer_address,issuer_district,issuer_city,issuer_sii_office,issuer_email,issuer_phone,default_payment_due_days,invoice_provider,provider_environment,updated_at";

function fail(error, message) {
  if (!error) return;
  const wrapped = new Error(`${message}: ${error.message}`);
  wrapped.code = error.code;
  throw wrapped;
}

export async function readSettingsRow(db) {
  const result = await db.from("billing_settings").select(COLUMNS).eq("id", 1).maybeSingle();
  fail(result.error, "No fue posible leer la configuración de facturación");
  return result.data || {};
}

export async function getBillingSettings(db) {
  return fromSettingsRow(await readSettingsRow(db));
}

export async function saveBillingSettings(db, row, actorId) {
  const previous = await readSettingsRow(db);
  const result = await db.from("billing_settings").upsert({ id: 1, ...row, updated_by: actorId || null, updated_at: new Date().toISOString() }).select(COLUMNS).single();
  fail(result.error, "No fue posible guardar la configuración de facturación");
  const audit = await db.from("billing_settings_audit").insert({ actor_id: actorId || null, previous_value: previous, new_value: result.data });
  fail(audit.error, "No fue posible registrar la auditoría de la configuración");
  return fromSettingsRow(result.data);
}
