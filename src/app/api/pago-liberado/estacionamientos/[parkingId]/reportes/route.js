import { NextResponse } from "next/server";
import { authorizationFromDb } from "@/lib/releasedPayment/authorizationCore.mjs";
import { paymentFromDb } from "@/lib/releasedPayment/paymentCore.mjs";
import {
  agreementReportRow,
  authorizationOverlapsRange,
  historyReportRow,
  MAX_REPORT_ROWS,
  parseReportRange,
  regularizationHistoryRow,
  REPORT_TYPES,
  sortHistoryRows,
  stayReportRow,
} from "@/lib/releasedPayment/reportCore.mjs";
import { authorizeReleasedPayment, fail, loadRegularizations, requireScopedParking, storageMissing } from "@/lib/releasedPayment/releasedPaymentServer";

// Etapa 3 (paso 3.1): reportes de Pago liberado por estacionamiento, para el
// administrador de la empresa y la supervisión Root. Solo lectura.
// ?tipo=estadias|acuerdos|historial&desde=AAAA-MM-DD&hasta=AAAA-MM-DD
// La pantalla exporta a Excel/CSV/PDF con la planilla Off Street.

export const dynamic = "force-dynamic";

function failure(error) {
  if (storageMissing(error)) return fail("Pago liberado aún no está habilitado en la base (migración pendiente).", 503);
  console.error("[released-payment:report]", error.code, error.message);
  return fail("No fue posible generar el reporte.", 500);
}

async function loadAuthorizations(db, parkingId) {
  const { data, error } = await db.from("released_payment_authorizations").select("*").eq("parking_id", parkingId).order("license_plate").limit(MAX_REPORT_ROWS);
  if (error) throw error;
  return (data || []).map(authorizationFromDb);
}

const STAY_COLUMNS = "id,code,license_plate,status,entry_at,exit_at,entry_operator_name,exit_operator_name,released_covered_seconds,released_chargeable_seconds,total_amount,payment_method,payment_code,released_payment_authorization_id";

async function staysReport(db, parking, fromIso, toIso) {
  const [stays, authorizations, regularizations] = await Promise.all([
    db.from("parking_stays")
      .select(STAY_COLUMNS)
      .eq("parking_id", parking.id)
      .not("released_payment_authorization_id", "is", null)
      .gte("entry_at", fromIso)
      .lt("entry_at", toIso)
      .order("entry_at")
      .limit(MAX_REPORT_ROWS + 1),
    loadAuthorizations(db, parking.id),
    loadRegularizations(db, parking.id, { limit: MAX_REPORT_ROWS }),
  ]);
  if (stays.error) throw stays.error;
  const regularizationsByStay = new Map();
  for (const item of regularizations) regularizationsByStay.set(item.stayId, [...(regularizationsByStay.get(item.stayId) || []), item]);
  // Estadías cuyo beneficio se anuló estando abiertas: ya no tienen
  // autorización, pero siguen siendo parte del reporte.
  const listed = new Set((stays.data || []).map((stay) => stay.id));
  const missing = [...regularizationsByStay.keys()].filter((id) => !listed.has(id));
  let extra = [];
  for (let index = 0; index < missing.length; index += 200) {
    const { data, error } = await db.from("parking_stays").select(STAY_COLUMNS).eq("parking_id", parking.id).in("id", missing.slice(index, index + 200)).gte("entry_at", fromIso).lt("entry_at", toIso);
    if (error) throw error;
    extra = extra.concat(data || []);
  }
  const byId = new Map(authorizations.map((item) => [item.id, item]));
  return [...(stays.data || []), ...extra]
    .sort((a, b) => String(a.entry_at).localeCompare(String(b.entry_at)))
    .map((stay) => stayReportRow(stay, byId, regularizationsByStay));
}

async function agreementsReport(db, parking, fromIso, toIso) {
  const [authorizations, payments] = await Promise.all([
    loadAuthorizations(db, parking.id),
    db.from("released_payment_beneficiary_payments").select("*").eq("parking_id", parking.id).limit(MAX_REPORT_ROWS * 2),
  ]);
  if (payments.error) throw payments.error;
  const allPayments = (payments.data || []).map(paymentFromDb);
  return authorizations.filter((item) => authorizationOverlapsRange(item, fromIso, toIso)).map((item) => agreementReportRow(item, allPayments));
}

async function historyReport(db, parking, fromIso, toIso) {
  const columns = "id,event_type,previous_values,new_values,reason,actor_email,actor_role,created_at";
  const [moduleEvents, authorizationEvents, authorizations, regularizations] = await Promise.all([
    db.from("released_payment_module_events").select(columns).eq("parking_id", parking.id).gte("created_at", fromIso).lt("created_at", toIso).limit(MAX_REPORT_ROWS + 1),
    db.from("released_payment_authorization_events").select(`${columns},authorization_id`).eq("parking_id", parking.id).gte("created_at", fromIso).lt("created_at", toIso).limit(MAX_REPORT_ROWS + 1),
    loadAuthorizations(db, parking.id),
    loadRegularizations(db, parking.id, { fromIso, toIso, limit: MAX_REPORT_ROWS + 1 }),
  ]);
  if (moduleEvents.error) throw moduleEvents.error;
  if (authorizationEvents.error) throw authorizationEvents.error;
  const plates = new Map(authorizations.map((item) => [item.id, item.licensePlate]));
  return sortHistoryRows([
    ...[...(moduleEvents.data || []), ...(authorizationEvents.data || [])].map((event) => historyReportRow(event, plates)),
    ...regularizations.map(regularizationHistoryRow),
  ]);
}

const REPORTS = {
  [REPORT_TYPES.ESTADIAS]: staysReport,
  [REPORT_TYPES.ACUERDOS]: agreementsReport,
  [REPORT_TYPES.HISTORIAL]: historyReport,
};

export async function GET(request, { params }) {
  const auth = await authorizeReleasedPayment(request, "read");
  if (auth.response) return auth.response;
  const { parkingId } = await params;
  const url = new URL(request.url);
  const type = url.searchParams.get("tipo") || REPORT_TYPES.ESTADIAS;
  const build = REPORTS[type];
  if (!build) return fail("Tipo de reporte no válido.", 400);
  const range = parseReportRange(url.searchParams.get("desde"), url.searchParams.get("hasta"));
  if (range.error) return fail(range.error, 400);
  try {
    const parking = await requireScopedParking(auth.db, auth, parkingId);
    if (!parking) return fail("No se encontró el estacionamiento.", 404);
    const rows = await build(auth.db, parking, range.fromIso, range.toIso);
    const truncated = rows.length > MAX_REPORT_ROWS;
    return NextResponse.json({
      data: { type, parking: { id: parking.id, code: parking.code, name: parking.name, companyName: parking.company_name }, rows: rows.slice(0, MAX_REPORT_ROWS), truncated },
    });
  } catch (error) {
    return failure(error);
  }
}
