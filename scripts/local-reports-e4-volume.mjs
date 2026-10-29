// E4 (SOL-2026-10-28-005): rendimiento con volumen sintético, sin base de
// datos. Mide armado de reportes y Excel en el límite de 50.000 filas.
// Uso: node --expose-gc scripts/local-reports-e4-volume.mjs
import { writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { buildPlateListReport, buildUsageReport, buildHistoryReport } from "../src/lib/reports/providers/releasedPlatesReports.mjs";
import { resolvePeriod } from "../src/lib/reports/engine/periodCore.mjs";
import { buildReportWorkbook, MAX_EXPORT_ROWS } from "../src/lib/reports/engine/workbookCore.mjs";
import { localParts } from "../src/lib/releasedPayment/zonedTime.mjs";

const now = Date.parse("2026-10-29T01:30:00Z");
const period = resolvePeriod("anio", { now });
const mb = () => Math.round(process.memoryUsage().heapUsed / 1048576);
const time = async (label, fn) => { globalThis.gc?.(); const m0 = mb(); const t0 = performance.now(); const out = await fn(); console.log(`${label.padEnd(44)} ${String(Math.round(performance.now() - t0)).padStart(6)} ms  heap +${mb() - m0} MB`); return out; };

const N = 20000;
const authorizations = Array.from({ length: N }, (_, i) => ({
  id: `a${i}`, displayPlate: `PT${String(i).padStart(4, "0")}`.slice(0, 4) + `-${String(i % 100).padStart(2, "0")}`, status: i % 50 === 0 ? "DELETED" : "ACTIVE",
  validFrom: new Date(now - (i % 300) * 86400000).toISOString(), validTo: new Date(now + ((i % 60) - 20) * 86400000).toISOString(),
  durationQuantity: 1, durationUnit: "DAY", beneficiaryName: `Beneficiario ${i}`, beneficiaryRut: "12.345.678-5", beneficiaryPhone: "+56 9 1234 5678",
  beneficiaryEmail: `b${i}@x.cl`, reason: "Convenio", modality: i % 3 ? "FREE" : "THIRD_PARTY", thirdParty: i % 3 ? null : { name: `Org ${i % 40}`, rut: "76.123.456-0", email: "f@x.cl", amount: 1.5, currency: i % 2 ? "UF" : "CLP" },
  usageMode: "MULTIPLE", maxUses: null, usesCount: i % 7, createdByEmail: "admin@x.cl", createdAt: new Date(now - 86400000).toISOString(),
  updatedByEmail: "admin@x.cl", finishedAt: null, deletedAt: i % 50 === 0 ? new Date(now - 3600000).toISOString() : null,
}));
const stays = Array.from({ length: MAX_EXPORT_ROWS }, (_, i) => ({
  id: `s${i}`, code: `ING-${i}`, parking_id: `p${i % 5}`, license_plate: authorizations[i % N].displayPlate, status: i % 20 ? "PAID" : "OPEN",
  entry_at: new Date(now - (i % 200) * 3600000).toISOString(), exit_at: i % 20 ? new Date(now - (i % 200) * 3600000 + 5400000).toISOString() : null,
  total_amount: i % 4 ? 0 : 600, released_plate_authorization_id: `a${i % N}`, released_covered_seconds: 3600, released_chargeable_seconds: i % 4 ? 0 : 1800,
}));
const events = Array.from({ length: MAX_EXPORT_ROWS }, (_, i) => ({ authorizationId: `a${i % N}`, type: i % 5 ? "USED" : "CREATED", at: new Date(now - i * 60000).toISOString(), actorEmail: "x@x.cl", parkingName: "Centro", useNumber: 1, stayCode: `ING-${i}` }));

const list = await time(`Listado (${N} autorizaciones)`, () => buildPlateListReport({ authorizations, period, now }));
const usage = await time(`Uso del beneficio (${MAX_EXPORT_ROWS} estadías)`, () => buildUsageReport({ stays, authorizations, parkingsById: new Map([["p0", "Centro"]]) }));
const history = await time(`Historial (${MAX_EXPORT_ROWS} eventos)`, () => buildHistoryReport({ authorizations, events }));
const meta = { companyName: "Volumen", parkings: ["Centro"], periodLabel: period.label, generatedAt: new Date(now).toISOString(), timeZone: "America/Santiago", filters: {} };
const opts = { toLocalParts: (ms) => localParts(ms), formatGenerated: () => "28-10-2026 22:30" };
for (const [label, data] of [[`Excel listado (${list.rows.length} filas)`, list], [`Excel uso (${usage.rows.length} filas)`, usage], [`Excel historial (${history.rows.length} filas)`, history]]) {
  const buffer = await time(label, () => buildReportWorkbook(ExcelJS, { title: label, meta, ...data }, opts));
  console.log(`${"".padEnd(44)} tamaño ${Math.round(buffer.byteLength / 1024)} KB`);
  if (process.env.E4_OUT_DIR && label.startsWith("Excel uso")) writeFileSync(`${process.env.E4_OUT_DIR}/volumen-uso-50000.xlsx`, buffer);
}
try { await buildReportWorkbook(ExcelJS, { title: "x", meta, ...usage, rows: [...usage.rows, {}] }, opts); console.log("FALLA: no aplicó el límite"); }
catch (error) { console.log(`Límite de ${MAX_EXPORT_ROWS} filas aplicado: ${error.message}`); }
