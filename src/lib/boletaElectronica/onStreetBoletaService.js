import "server-only";
import { decryptDteApiKey, DTE_STORAGE_MISSING_CODES } from "./dteSettingsCore.mjs";
import { emitBoleta } from "./openFacturaClient.mjs";
import { boletaIdempotencyKey, buildBoletaRequest, chileIssueDate, extractTedFromXml, splitGrossAmount } from "./openFacturaCore.mjs";
import { boletaForReceipt, emitterRutFor } from "./cashBoletaCore.mjs";
import { shouldIssueOnStreetBoleta } from "./onStreetBoletaCore.mjs";

// Boleta electrónica de un pago Webpay On Street
// (SOL-2026-11-12-004, etapa 3, segunda mitad). Mismo patrón que
// webpayBoletaService.js (Off Street) y cashBoletaService.js --
// deliberadamente duplicado, no compartido, para no arriesgar esos flujos
// ya en producción. Se llama DESPUÉS de confirmar el pago (nunca antes,
// nunca lo bloquea ni lo revierte). Tabla propia
// (on_street_payment_intent_dte_documents): on_street_payment_intents no
// tiene stay_id, así que no puede usar parking_stay_dte_documents.
const EMISSION_TIMEOUT_MS = 10000;
const DOCUMENT_COLUMNS = "intent_id,status,environment,folio,provider_token,ted,stamp_png_base64,resolution_date,resolution_number,net_amount,tax_amount,total_amount,error_code,error_message,attempts";

function storageMissing(error) {
  return DTE_STORAGE_MISSING_CODES.has(error?.code) || error?.code === "42703" || error?.code === "42P01";
}

async function loadEmissionContext(db, parkingId) {
  const parking = await db.from("parkings").select("id,company_id").eq("id", parkingId).maybeSingle();
  if (parking.error) throw parking.error;
  if (!parking.data?.company_id) return null;
  const [settings, company] = await Promise.all([
    db.from("company_dte_settings").select("company_id,environment,api_key_ciphertext,enabled_parking_ids,emitter_business_name,emitter_activity,emitter_address,emitter_commune,emitter_city,parking_branch_codes,test_emitter_rut").eq("company_id", parking.data.company_id).maybeSingle(),
    db.from("companies").select("id,rut_number,rut_dv").eq("id", parking.data.company_id).maybeSingle(),
  ]);
  if (settings.error) throw settings.error;
  if (company.error) throw company.error;
  return { parking: parking.data, settings: settings.data, company: company.data };
}

// `paymentCode`: el buy_order de la transacción Webpay (no existe un
// payment_code propio en on_street_payment_intents) -- lo entrega el
// llamador, que ya lo tiene a mano al momento de confirmar el pago.
export async function issueOnStreetPaymentBoleta(db, intent, paymentCode, { emit = emitBoleta } = {}) {
  let context;
  try {
    context = await loadEmissionContext(db, intent?.parking_id);
  } catch (error) {
    if (!storageMissing(error)) console.error("[on-street-boleta:context]", { code: error?.code, message: error?.message });
    return null;
  }
  if (!context || !shouldIssueOnStreetBoleta({ intent, settings: context.settings })) return null;

  const existing = await db.from("on_street_payment_intent_dte_documents").select(DOCUMENT_COLUMNS).eq("intent_id", intent.id).maybeSingle();
  if (existing.error) {
    if (!storageMissing(existing.error)) console.error("[on-street-boleta:existing]", { code: existing.error.code, message: existing.error.message });
    return null;
  }
  if (existing.data?.status === "ISSUED") return boletaForReceipt(existing.data);

  const { settings, company, parking } = context;
  const amounts = splitGrossAmount(intent.amount);
  const base = {
    intent_id: intent.id,
    company_id: parking.company_id,
    parking_id: parking.id,
    provider: "HAULMER",
    environment: settings.environment,
    document_type: 39,
    payment_code: String(paymentCode || "").slice(0, 60),
    idempotency_key: boletaIdempotencyKey(String(paymentCode || intent.id)),
    total_amount: amounts.total,
    net_amount: amounts.net,
    tax_amount: amounts.vat,
    attempts: (existing.data?.attempts || 0) + 1,
    updated_at: new Date().toISOString(),
  };

  let row;
  try {
    const request = buildBoletaRequest({
      emitter: {
        rut: emitterRutFor(settings, company),
        businessName: settings.emitter_business_name,
        activity: settings.emitter_activity,
        address: settings.emitter_address,
        commune: settings.emitter_commune,
        city: settings.emitter_city,
        siiBranchCode: settings.parking_branch_codes?.[parking.id] || "",
      },
      sale: { total: amounts.total, description: `Estacionamiento en la calle ${intent.license_plate_normalized || ""}`.trim(), issueDate: chileIssueDate(new Date(intent.paid_at || Date.now())) },
      responseParts: ["FOLIO", "TIMBRE", "XML", "RESOLUCION"],
    });
    const apiKey = decryptDteApiKey(settings.api_key_ciphertext);
    const result = await emit({ environment: settings.environment, apiKey, request, paymentCode: base.payment_code, timeoutMs: EMISSION_TIMEOUT_MS });
    row = {
      ...base,
      status: "ISSUED",
      folio: result.folio,
      provider_token: result.token,
      ted: extractTedFromXml(result.xmlBase64),
      stamp_png_base64: result.stampPngBase64,
      resolution_date: result.resolution?.date || null,
      resolution_number: result.resolution?.number ?? null,
      warning: result.warning || null,
      error_code: null,
      error_message: null,
      issued_at: new Date().toISOString(),
    };
  } catch (error) {
    console.error("[on-street-boleta:emit]", { intentId: intent.id, code: error?.code, status: error?.status, message: error?.message });
    row = { ...base, status: "FAILED", error_code: String(error?.code || "DTE_UNKNOWN").slice(0, 40), error_message: String(error?.message || "").slice(0, 300) };
  }

  const saved = await db.from("on_street_payment_intent_dte_documents").upsert(row, { onConflict: "intent_id" }).select(DOCUMENT_COLUMNS).single();
  if (saved.error) {
    console.error("[on-street-boleta:save]", { intentId: intent.id, code: saved.error.code, message: saved.error.message, status: row.status, folio: row.folio || null });
    return boletaForReceipt(row);
  }
  return boletaForReceipt(saved.data);
}
