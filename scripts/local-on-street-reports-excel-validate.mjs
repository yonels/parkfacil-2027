/******************************************************************
 * Validación local §44: genera un Excel REAL (Detalle + Resumen) del
 * Reporte On Street "sesiones" a partir de datos reales del Supabase
 * LOCAL, replicando exactamente la lógica de
 * src/lib/onStreetAdminRepository.js::getOnStreetReport (reutilizando
 * las mismas funciones puras de onStreetDashboardCore.mjs/
 * onStreetAdminCore.mjs/onStreetInspectionsAdminCore.mjs, NO
 * duplicando cálculos) y la misma construcción de workbook de
 * src/components/on-street-admin/OnStreetReports.js::exportReportExcel
 * (adaptada para escribir a disco en vez de un Blob del navegador).
 *
 * Luego RELEE el .xlsx generado con exceljs y verifica programática-
 * mente: hojas correctas, headers correctos, cantidad de filas,
 * montos numéricos, fechas como fechas reales (no texto).
 *
 * Uso:
 *   node --env-file=.env.local scripts/local-on-street-reports-excel-validate.mjs
 *
 * Solo lectura sobre Supabase LOCAL -- no hace ningún INSERT/UPDATE/
 * DELETE, no toca Producción.
 ******************************************************************/
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import {
  computeKpis,
  extensionsBreakdown,
  locationRanking,
  paymentMethodBreakdown,
  resolvePeriodBounds,
  revenueBreakdown,
  sortLocationRanking,
} from "../src/lib/onStreetDashboardCore.mjs";
import { computeInspectionKpis } from "../src/lib/onStreetInspectionsAdminCore.mjs";
import { maskAdminPhone, paymentTypeFromTransaction, visibleOnStreetStatus } from "../src/lib/onStreetAdminCore.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.match(url || "", /^http:\/\/(127\.0\.0\.1|localhost):54321$/, "Este script solo corre contra Supabase LOCAL (127.0.0.1:54321)");
assert.ok(serviceKey, "SUPABASE_SERVICE_ROLE_KEY requerida");

const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const fail = (r) => { if (r.error) throw r.error; return r.data || []; };

// Período amplio (1 año) para asegurar datos reales existentes en el
// entorno local de pruebas, igual mecánica que resolvePeriodBounds("year").
const bounds = resolvePeriodBounds("year");
console.log("[EXCEL-VALIDATE] Período:", bounds);

const parkings = fail(await db.from("parkings").select("id,code,name,company_id,company_name").eq("type", "ON_STREET"));
assert.ok(parkings.length, "No hay parkings ON_STREET en el entorno local — no se puede validar con datos reales.");
const parkingIds = parkings.map((p) => p.id);

const [locationsRes, sectorsRes, streetsRes, segmentsRes] = await Promise.all([
  db.from("on_street_qr_locations").select("id,public_code,label,parking_id,sector_id,street_id,segment_id,status").in("parking_id", parkingIds),
  db.from("parking_sectors").select("id,parking_id,code,name").in("parking_id", parkingIds),
  db.from("parking_streets").select("id,parking_id,sector_id,name").in("parking_id", parkingIds),
  db.from("parking_street_segments").select("id,parking_id,area_id,street_id,code,name,street_side").in("parking_id", parkingIds),
]);
const locations = fail(locationsRes), sectors = fail(sectorsRes), streets = fail(streetsRes), segments = fail(segmentsRes);
const locationById = new Map(locations.map((l) => [l.id, l]));
const parkingById = new Map(parkings.map((p) => [p.id, p]));
const sectorById = new Map(sectors.map((s) => [s.id, s]));
const streetById = new Map(streets.map((s) => [s.id, s]));
const segmentById = new Map(segments.map((s) => [s.id, s]));

function locate(row) {
  const loc = row.qr_location_id ? locationById.get(row.qr_location_id) : null;
  const parking = parkingById.get(row.parking_id) || null;
  const street = loc?.street_id ? streetById.get(loc.street_id) : null;
  const segment = loc?.segment_id ? segmentById.get(loc.segment_id) : null;
  const sector = loc?.sector_id ? sectorById.get(loc.sector_id) : null;
  const label = [parking?.name, street?.name, segment?.name, loc?.public_code].filter(Boolean).join(" · ") || loc?.label || "Ubicación no disponible";
  return { label, parking, street, segment, sector };
}

// Excluye las filas sintéticas dejadas por local-on-street-volume-e2e.mjs /
// local-on-street-extension-e2e.mjs en este mismo entorno local (esa tabla
// no tiene GRANT DELETE para service_role -- ver informe -- así que sus
// propios scripts no pueden limpiarlas). Esta validación busca representar
// datos reales, no el volumen sintético de otra prueba.
const sessionsRaw = fail(await db.from("on_street_pilot_sessions").select("id,operational_number,qr_location_id,parking_id,phone_normalized,license_plate_normalized,status,started_at,expires_at,ended_at,purchased_minutes,amount_paid,payment_transaction_id").in("parking_id", parkingIds).gte("started_at", bounds.from).lte("started_at", bounds.to).not("operational_number", "ilike", "%E2E%").order("started_at", { ascending: false }).limit(2000));
const sessions = sessionsRaw.map((row) => ({ ...row, location: locate(row) }));
const sessionMap = new Map(sessions.map((s) => [s.id, s]));
const sessionIds = sessions.map((s) => s.id);
assert.ok(sessions.length, "No hay sesiones On Street en el período de prueba (año) en el entorno local — no se puede validar con datos reales.");

const extensions = sessionIds.length ? fail(await db.from("on_street_pilot_extensions").select("id,session_id,additional_minutes,simulated_amount,payment_transaction_id,created_at").in("session_id", sessionIds)) : [];
const intents = fail(await db.from("on_street_payment_intents").select("id,parking_id,qr_location_id,operation_type,resulting_session_id,target_session_id").in("parking_id", parkingIds).gte("created_at", bounds.from).lte("created_at", bounds.to));
const intentMap = new Map(intents.map((i) => [i.id, i]));
const intentIds = intents.map((i) => i.id);
const paymentAttempts = intentIds.length ? fail(await db.from("payment_transactions").select("id,source_id,status,amount,currency,buy_order,authorization_code,payment_type,created_at,committed_at").in("source_id", intentIds)) : [];

const activeSessionsNowResult = await db.from("on_street_pilot_sessions").select("id", { count: "exact", head: true }).in("parking_id", parkingIds).eq("status", "ACTIVE");
const activeSessionsNow = activeSessionsNowResult.count || 0;

const inspectionRows = fail(await db.from("on_street_inspections").select("session_id,inspector_user_id,inspected_at,license_plate_normalized,inspection_type,sms_status").in("parking_id", parkingIds).gte("inspected_at", bounds.from).lte("inspected_at", bounds.to).limit(2000));
const inspectorIds = [...new Set(inspectionRows.map((r) => r.inspector_user_id).filter(Boolean))];
const inspectorEmails = inspectorIds.length ? await db.auth.admin.listUsers({ perPage: 200 }).then((r) => new Map((r.data?.users || []).map((u) => [u.id, u.email]))) : new Map();
const inspectionBySession = new Map(inspectionRows.filter((r) => r.session_id).map((r) => [r.session_id, r]));

const summary = {
  kpis: computeKpis({ sessions, extensions, paymentAttempts, activeSessionsNow }),
  revenue: revenueBreakdown(paymentAttempts, intentMap),
  paymentMethods: paymentMethodBreakdown(paymentAttempts),
  extensions: extensionsBreakdown(sessions, extensions),
  places: sortLocationRanking(locationRanking(sessions, extensions, (s) => s.location), "revenue").slice(0, 10),
  inspections: computeInspectionKpis(inspectionRows),
};

const rows = sessions.map((s) => {
  const inspection = inspectionBySession.get(s.id);
  return {
    ...s,
    phone: maskAdminPhone(s.phone_normalized),
    status: visibleOnStreetStatus(s),
    ubicacion: s.location?.label || "—",
    extensionCount: extensions.filter((e) => e.session_id === s.id).length,
    fiscalized: Boolean(inspection),
    inspector: inspection ? inspectorEmails.get(inspection.inspector_user_id) || "—" : "—",
    fiscalizedAt: inspection?.inspected_at || null,
  };
});

console.log(`[EXCEL-VALIDATE] ${rows.length} sesiones, ${extensions.length} extensiones, ${paymentAttempts.length} transacciones, ${inspectionRows.length} fiscalizaciones en alcance.`);

// --- Construcción del workbook: mismas columnas que columnsFor("sesiones")
// en OnStreetReports.js, misma lógica de exportReportExcel (fechas reales,
// booleanos como Sí/No, Hoja 1 Detalle + Hoja 2 Resumen). ---
const columns = [
  { key: "operational_number", label: "Sesión" },
  { key: "license_plate_normalized", label: "Patente" },
  { key: "ubicacion", label: "Ubicación" },
  { key: "phone", label: "Teléfono" },
  { key: "started_at", label: "Inicio" },
  { key: "purchased_minutes", label: "Minutos" },
  { key: "expires_at", label: "Vencimiento" },
  { key: "amount_paid", label: "Monto" },
  { key: "extensionCount", label: "Extensiones" },
  { key: "status", label: "Estado" },
  { key: "fiscalized", label: "Fiscalizado" },
  { key: "inspector", label: "Inspector" },
  { key: "fiscalizedAt", label: "Fecha/hora fiscalización" },
];
const DATE_KEYS = new Set(["started_at", "expires_at", "fiscalizedAt"]);

const workbook = new ExcelJS.Workbook();
workbook.creator = "ParkFacil 2027";
const detailSheet = workbook.addWorksheet("Detalle");
detailSheet.columns = columns.map((c) => ({ header: c.label, key: c.key, width: 22 }));
rows.forEach((row) => {
  const item = {};
  columns.forEach((c) => {
    const raw = row[c.key];
    if (raw == null) { item[c.key] = "—"; return; }
    if (DATE_KEYS.has(c.key)) { const d = new Date(raw); item[c.key] = Number.isNaN(d.getTime()) ? String(raw) : d; return; }
    if (typeof raw === "boolean") { item[c.key] = raw ? "Sí" : "No"; return; }
    item[c.key] = raw;
  });
  detailSheet.addRow(item);
});
detailSheet.getRow(1).font = { bold: true };
columns.forEach((c, i) => { if (DATE_KEYS.has(c.key)) detailSheet.getColumn(i + 1).numFmt = "dd/mm/yyyy hh:mm"; });

const summarySheet = workbook.addWorksheet("Resumen");
summarySheet.columns = [{ header: "Indicador", key: "k", width: 40 }, { header: "Valor", key: "v", width: 24 }];
summarySheet.getRow(1).font = { bold: true };
const addRow = (k, v) => summarySheet.addRow({ k, v });
addRow("Tipo de reporte", "Sesiones");
addRow("Período", `${new Date(bounds.from).toLocaleString("es-CL")} — ${new Date(bounds.to).toLocaleString("es-CL")}`);
addRow("Filas exportadas", rows.length);
addRow("Vehículos / sesiones en el período", summary.kpis.sessionsInPeriod);
addRow("Recaudación total (sesiones)", Number(summary.kpis.revenue));
addRow("Ticket promedio", Number(summary.kpis.averageTicket));
addRow("Ingreso por pago inicial", Number(summary.revenue.initial));
addRow("Ingreso por extensiones", Number(summary.revenue.extension));
addRow("Fiscalizaciones totales", summary.inspections.total);
summarySheet.getColumn("v").numFmt = "#,##0";

const outPath = new URL("../on_street_reporte_sesiones.local-validate.xlsx", import.meta.url);
await workbook.xlsx.writeFile(outPath);
console.log(`[EXCEL-VALIDATE] Archivo escrito: ${outPath.pathname}`);

// --- Releer el archivo generado y validar programáticamente (§44) ---
const reread = new ExcelJS.Workbook();
await reread.xlsx.readFile(outPath);
const sheetNames = reread.worksheets.map((s) => s.name);
assert.deepEqual(sheetNames, ["Detalle", "Resumen"], `Hojas inesperadas: ${sheetNames}`);

const detail = reread.getWorksheet("Detalle");
const headerRow = detail.getRow(1).values.slice(1);
assert.deepEqual(headerRow, columns.map((c) => c.label), "Headers de Detalle no coinciden");
assert.equal(detail.rowCount - 1, rows.length, `Filas de Detalle: esperado ${rows.length}, encontrado ${detail.rowCount - 1}`);

// Monto (columna 8, "Monto") debe ser numérico, no texto.
const amountColIndex = columns.findIndex((c) => c.key === "amount_paid") + 1;
let numericAmountRows = 0, dateTypedRows = 0;
detail.eachRow((row, rowNumber) => {
  if (rowNumber === 1) return;
  const amountCell = row.getCell(amountColIndex);
  if (typeof amountCell.value === "number") numericAmountRows += 1;
  const startedCell = row.getCell(columns.findIndex((c) => c.key === "started_at") + 1);
  if (startedCell.value instanceof Date) dateTypedRows += 1;
});
assert.ok(numericAmountRows > 0, "Ningún monto quedó como número — export inválido.");
assert.ok(dateTypedRows > 0, "Ninguna fecha quedó como tipo fecha real de Excel — export inválido.");
console.log(`[EXCEL-VALIDATE] Montos numéricos: ${numericAmountRows}/${rows.length}. Fechas tipo Date: ${dateTypedRows}/${rows.length}.`);

const resumen = reread.getWorksheet("Resumen");
assert.deepEqual(resumen.getRow(1).values.slice(1), ["Indicador", "Valor"], "Headers de Resumen no coinciden");
const filasExportadasRow = resumen.getRows(1, resumen.rowCount).find((r) => r.getCell(1).value === "Filas exportadas");
assert.ok(filasExportadasRow, "Fila 'Filas exportadas' no encontrada en Resumen");
assert.equal(Number(filasExportadasRow.getCell(2).value), rows.length, "El Resumen no coincide con la cantidad de filas del Detalle (posible doble conteo o filtro no respetado).");

console.log("[EXCEL-VALIDATE] OK — archivo .xlsx válido, 2 hojas correctas, headers correctos, filas correctas, montos numéricos, fechas reales, Resumen consistente con Detalle.");
