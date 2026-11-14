import "server-only";

import { buildPublicReceiptRows } from "./publicReceiptsCore.mjs";

// Trae y arma las filas visibles de «Consulte su boleta» para una patente.
// Compartido entre /api/public-receipts/search (toda la patente) y
// /api/public-receipts/send (una sola estadía, acotada por el token) --
// una sola consulta a la base, sin duplicar el cruce de parkings/companies/
// boletas en dos sitios.
export async function fetchPublicReceiptRows(db, { plate, isProduction, stayIds = null }) {
  let query = db
    .from("parking_stays")
    .select("id,parking_id,entry_at,exit_at,payment_method,payment_card_type,card_last4,card_payment_reference,card_payment_approved_at,payment_code,net_amount,tax_amount,total_amount,status")
    .eq("license_plate", plate)
    .eq("status", "PAID")
    .order("exit_at", { ascending: false })
    .limit(500);
  if (Array.isArray(stayIds) && stayIds.length) query = query.in("id", stayIds);

  const staysResult = await query;
  if (staysResult.error) throw staysResult.error;
  const stays = staysResult.data || [];
  if (!stays.length) return [];

  const parkingIds = [...new Set(stays.map((s) => s.parking_id).filter(Boolean))];
  const stayRowIds = stays.map((s) => s.id);

  const [parkingsResult, boletasResult] = await Promise.all([
    parkingIds.length
      ? db.from("parkings").select("id,name,city,company_id").in("id", parkingIds)
      : Promise.resolve({ data: [], error: null }),
    stayRowIds.length
      ? db.from("parking_stay_dte_documents").select("stay_id,status,environment,folio,net_amount,tax_amount,total_amount").in("stay_id", stayRowIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (parkingsResult.error) throw parkingsResult.error;
  if (boletasResult.error) throw boletasResult.error;

  const parkingsById = new Map((parkingsResult.data || []).map((p) => [p.id, p]));
  const boletasByStayId = new Map((boletasResult.data || []).map((b) => [b.stay_id, b]));

  const companyIds = [...new Set((parkingsResult.data || []).map((p) => p.company_id).filter(Boolean))];
  let companiesById = new Map();
  if (companyIds.length) {
    const companiesResult = await db.from("companies").select("id,business_name,rut_number,rut_dv,address,district,city").in("id", companyIds);
    if (companiesResult.error) throw companiesResult.error;
    companiesById = new Map((companiesResult.data || []).map((c) => [c.id, c]));
  }

  return buildPublicReceiptRows({ stays, boletasByStayId, parkingsById, companiesById, isProduction });
}
