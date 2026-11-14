import "server-only";

import { buildPublicReceiptRows } from "./publicReceiptsCore.mjs";

// Trae y arma las filas visibles de «Consulte su boleta» para una patente:
// Off Street (parking_stays, con o sin boleta -- comprobante C de respaldo)
// y On Street (on_street_payment_intents, solo boleta -- SOL-2026-11-12-004
// etapa 3, 2026-11-14). Compartido entre /api/public-receipts/search (toda
// la patente) y /send /document (acotado por `stayIds`, que identifica
// tanto estadías Off Street como intentos On Street -- son UUID de tablas
// distintas, nunca chocan).
export async function fetchPublicReceiptRows(db, { plate, isProduction, stayIds = null }) {
  const plateCompact = String(plate || "").replace(/[^A-Z0-9]/g, "");
  const idFilter = Array.isArray(stayIds) && stayIds.length ? stayIds : null;

  let staysQuery = db
    .from("parking_stays")
    .select("id,parking_id,entry_at,exit_at,payment_method,payment_card_type,card_last4,card_payment_reference,card_payment_approved_at,payment_code,net_amount,tax_amount,total_amount,status")
    .eq("license_plate", plate)
    .eq("status", "PAID")
    .order("exit_at", { ascending: false })
    .limit(500);
  if (idFilter) staysQuery = staysQuery.in("id", idFilter);

  let intentsQuery = db
    .from("on_street_payment_intents")
    .select("id,parking_id,amount,status,paid_at")
    .eq("license_plate_normalized", plateCompact)
    .eq("status", "PAID")
    .order("paid_at", { ascending: false })
    .limit(500);
  if (idFilter) intentsQuery = intentsQuery.in("id", idFilter);

  const [staysResult, intentsResult] = await Promise.all([staysQuery, intentsQuery]);
  if (staysResult.error) throw staysResult.error;
  if (intentsResult.error) throw intentsResult.error;
  const stays = staysResult.data || [];
  const onStreetIntents = intentsResult.data || [];
  if (!stays.length && !onStreetIntents.length) return [];

  const parkingIds = [...new Set([...stays.map((s) => s.parking_id), ...onStreetIntents.map((i) => i.parking_id)].filter(Boolean))];
  const stayRowIds = stays.map((s) => s.id);
  const intentIds = onStreetIntents.map((i) => i.id);

  const [parkingsResult, boletasResult, onStreetBoletasResult] = await Promise.all([
    parkingIds.length
      ? db.from("parkings").select("id,name,city,company_id").in("id", parkingIds)
      : Promise.resolve({ data: [], error: null }),
    stayRowIds.length
      ? db.from("parking_stay_dte_documents").select("stay_id,status,environment,folio,net_amount,tax_amount,total_amount").in("stay_id", stayRowIds)
      : Promise.resolve({ data: [], error: null }),
    intentIds.length
      ? db.from("on_street_payment_intent_dte_documents").select("intent_id,status,environment,folio,net_amount,tax_amount,total_amount,payment_code").in("intent_id", intentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (parkingsResult.error) throw parkingsResult.error;
  if (boletasResult.error) throw boletasResult.error;
  if (onStreetBoletasResult.error) throw onStreetBoletasResult.error;

  const parkingsById = new Map((parkingsResult.data || []).map((p) => [p.id, p]));
  const boletasByStayId = new Map((boletasResult.data || []).map((b) => [b.stay_id, b]));
  const onStreetBoletasByIntentId = new Map((onStreetBoletasResult.data || []).map((b) => [b.intent_id, b]));

  const companyIds = [...new Set((parkingsResult.data || []).map((p) => p.company_id).filter(Boolean))];
  let companiesById = new Map();
  if (companyIds.length) {
    const companiesResult = await db.from("companies").select("id,business_name,rut_number,rut_dv,address,district,city").in("id", companyIds);
    if (companiesResult.error) throw companiesResult.error;
    companiesById = new Map((companiesResult.data || []).map((c) => [c.id, c]));
  }

  return buildPublicReceiptRows({ stays, boletasByStayId, parkingsById, companiesById, onStreetIntents, onStreetBoletasByIntentId, isProduction });
}
