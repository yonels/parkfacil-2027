import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { findReport, flattenReports, REPORT_STATUS, REPORT_TREE, reportAncestors, searchTree, treeKeyAction, visibleNodes } from "./registry.mjs";
import { MAX_CUSTOM_DAYS, overlapsPeriod, resolvePeriod } from "./periodCore.mjs";
import { buildReportWorkbook, cellValue, MAX_EXPORT_ROWS, safeCellText } from "./workbookCore.mjs";
import { buildPlateListReport } from "../providers/releasedPlatesReports.mjs";
import { localParts } from "../../releasedPayment/zonedTime.mjs";

test("registro: ids únicos, estados válidos y Patentes Autorizadas con reporte disponible", () => {
  const all = flattenReports();
  assert.equal(new Set(all.map((r) => r.id)).size, all.length);
  assert.ok(all.every((r) => REPORT_STATUS[r.status]));
  assert.equal(findReport("pl-listado").status, REPORT_STATUS.AVAILABLE);
  assert.deepEqual(reportAncestors("pl-listado"), ["off-street", "off-patentes"]);
  assert.equal(findReport("an-prediccion").status, REPORT_STATUS.EXPERIMENTAL);
  assert.equal(findReport("on-pl").status, REPORT_STATUS.NOT_APPLICABLE);
});

test("búsqueda sin tildes ni mayúsculas muestra el camino completo", () => {
  const found = searchTree("ocupacion por hora");
  assert.ok(found.has("oc-hora") && found.has("off-ocupacion") && found.has("off-street"));
  assert.equal(searchTree(""), null);
  assert.equal(searchTree("zzz").size, 0);
});

test("teclado: bajar, expandir, contraer, subir al padre y seleccionar", () => {
  const expanded = new Set(["off-street"]);
  let nodes = visibleNodes(REPORT_TREE, expanded);
  assert.deepEqual(treeKeyAction("ArrowDown", nodes, "off-street", expanded), { focus: "off-patentes" });
  assert.deepEqual(treeKeyAction("ArrowRight", nodes, "off-patentes", expanded), { expand: "off-patentes" });
  expanded.add("off-patentes");
  nodes = visibleNodes(REPORT_TREE, expanded);
  assert.deepEqual(treeKeyAction("ArrowRight", nodes, "off-patentes", expanded), { focus: "pl-listado" });
  assert.deepEqual(treeKeyAction("Enter", nodes, "pl-listado", expanded), { select: "pl-listado" });
  assert.deepEqual(treeKeyAction("ArrowLeft", nodes, "pl-listado", expanded), { focus: "off-patentes" });
  assert.deepEqual(treeKeyAction("ArrowLeft", nodes, "off-patentes", expanded), { collapse: "off-patentes" });
});

test("períodos en America/Santiago", () => {
  const now = Date.parse("2026-10-29T01:30:00Z"); // 28-10-2026 22:30 en Chile (miércoles)
  const today = resolvePeriod("hoy", { now });
  assert.equal(today.fromDate, "2026-10-28");
  assert.equal(today.fromIso, "2026-10-28T03:00:00.000Z");
  assert.equal(today.toIso, "2026-10-29T03:00:00.000Z");
  assert.equal(resolvePeriod("semana", { now }).fromDate, "2026-10-26");
  assert.equal(resolvePeriod("mes", { now }).toDate, "2026-10-31");
  assert.equal(resolvePeriod("personalizado", { from: "2026-10-10", to: "2026-10-01", now }).ok, false);
  assert.equal(resolvePeriod("personalizado", { from: "2025-01-01", to: "2026-12-31", now }).ok, false, `máx. ${MAX_CUSTOM_DAYS} días`);
  assert.equal(overlapsPeriod("2026-10-27T00:00:00Z", "2026-10-28T05:00:00Z", today), true);
  assert.equal(overlapsPeriod("2026-10-20T00:00:00Z", "2026-10-28T03:00:00Z", today), false);
});

test("protección contra fórmulas y valores de celda", () => {
  assert.equal(safeCellText("=HYPERLINK(\"x\")"), "'=HYPERLINK(\"x\")");
  assert.equal(safeCellText("-1+2"), "'-1+2");
  assert.equal(cellValue("12.5", "uf", localParts), 12.5);
  const d = cellValue("2026-10-28T11:00:00Z", "datetime", (ms) => localParts(ms));
  assert.equal(d.toISOString(), "2026-10-28T08:00:00.000Z");
});

const auth = (extra) => ({
  id: "a", displayPlate: "ABCD-12", status: "ACTIVE", validFrom: "2026-10-28T11:00:00Z", validTo: "2026-10-30T11:00:00Z",
  durationQuantity: 2, durationUnit: "DAY", beneficiaryName: "Ana", beneficiaryRut: "12.345.678-5", beneficiaryPhone: "+56 9 1234 5678",
  beneficiaryEmail: "a@b.cl", reason: "Cortesía", modality: "FREE", thirdParty: null, usageMode: "MULTIPLE", maxUses: null, usesCount: 3,
  createdByEmail: "admin@x.cl", createdAt: "2026-10-27T11:00:00Z", ...extra,
});

test("listado de patentes: KPI, monedas separadas, eliminadas fuera y Excel con Resumen, Detalle y Gráficos", async () => {
  const now = Date.parse("2026-10-29T01:30:00Z");
  const period = resolvePeriod("mes", { now });
  const data = buildPlateListReport({
    now, period,
    authorizations: [
      auth({ id: "1" }),
      auth({ id: "2", displayPlate: "=CMD-11", modality: "THIRD_PARTY", thirdParty: { name: "Conv", amount: 2.5, currency: "UF" }, validFrom: "2026-11-02T11:00:00Z", validTo: "2026-11-05T11:00:00Z" }),
      auth({ id: "3", displayPlate: "XY-1234", modality: "THIRD_PARTY", thirdParty: { name: "Otro", amount: 35000, currency: "CLP" } }),
      auth({ id: "4", status: "DELETED" }),
      auth({ id: "5", validFrom: "2026-08-01T00:00:00Z", validTo: "2026-08-02T00:00:00Z" }),
    ],
  });
  const kpi = Object.fromEntries(data.kpis.map((k) => [k.key, k.value]));
  assert.equal(kpi.total, 2); // id 2 es de noviembre, 4 eliminada, 5 fuera del período
  assert.equal(kpi.thirdPartyUf, 0);
  assert.equal(kpi.thirdPartyClp, 35000);
  assert.equal(kpi.entries, 6);
  const deleted = buildPlateListReport({ now, period, filters: { status: "DELETED" }, authorizations: [auth({ id: "4", status: "DELETED" })] });
  assert.equal(deleted.rows.length, 1);

  const result = { title: "Off Street · Listado", meta: { companyName: "Empresa", parkings: ["Centro"], periodLabel: period.label, generatedAt: new Date(now).toISOString(), timeZone: "America/Santiago", filters: { Patente: "" } }, ...data, rows: [...data.rows, { plate: "=CMD-11", status: "x" }] };
  const buffer = await buildReportWorkbook(ExcelJS, result, { toLocalParts: (ms) => localParts(ms), formatGenerated: () => "28-10-2026 22:30" });
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);
  assert.deepEqual(book.worksheets.map((s) => s.name), ["Resumen", "Detalle", "Gráficos"]);
  const detail = book.getWorksheet("Detalle");
  assert.equal(detail.getRow(1).getCell(1).value, "Patente");
  assert.equal(detail.rowCount, 1 + 3 + 1); // encabezado + 3 filas + total
  assert.equal(detail.getRow(4).getCell(1).value, "'=CMD-11");
  const clpColumn = data.columns.findIndex((c) => c.key === "thirdPartyAmountClp") + 1;
  assert.equal(detail.getRow(5).getCell(clpColumn).value, 35000);
  assert.equal(detail.getRow(5).getCell(clpColumn).numFmt, '"$"#,##0');
  assert.equal(book.getWorksheet("Resumen").getRow(1).getCell(1).value, "Off Street · Listado");

  await assert.rejects(() => buildReportWorkbook(ExcelJS, { ...result, rows: new Array(MAX_EXPORT_ROWS + 1).fill({}) }, { toLocalParts: localParts, formatGenerated: () => "" }), /EXPORT_TOO_LARGE/);
});

test("cambios de horario de Chile (DST): días de 23 y 25 horas y meses con distinto desfase", () => {
  // 2026-09-06: Chile adelanta la hora (sábado 24:00 → domingo 01:00). El día dura 23 horas.
  const dstStart = resolvePeriod("personalizado", { from: "2026-09-06", to: "2026-09-06", now: Date.parse("2026-10-29T01:30:00Z") });
  assert.equal(dstStart.fromIso, "2026-09-06T04:00:00.000Z");
  assert.equal(dstStart.toIso, "2026-09-07T03:00:00.000Z");
  assert.equal((Date.parse(dstStart.toIso) - Date.parse(dstStart.fromIso)) / 3600000, 23);
  // Septiembre completo: comienza en UTC-4 y termina en UTC-3.
  const september = resolvePeriod("personalizado", { from: "2026-09-01", to: "2026-09-30", now: Date.parse("2026-10-29T01:30:00Z") });
  assert.equal(september.fromIso, "2026-09-01T04:00:00.000Z");
  assert.equal(september.toIso, "2026-10-01T03:00:00.000Z");
  // 2027-04-04: Chile atrasa la hora (domingo 00:00 → sábado 23:00). El sábado 3 dura 25 horas.
  const dstEnd = resolvePeriod("personalizado", { from: "2027-04-03", to: "2027-04-03", now: Date.parse("2027-04-10T12:00:00Z") });
  assert.equal((Date.parse(dstEnd.toIso) - Date.parse(dstEnd.fromIso)) / 3600000, 25);
});

test("lectura por páginas: recorre más allá del máximo por consulta y aplica el límite", async () => {
  const { fetchAllRows } = await import("./fetchAll.mjs");
  const source = Array.from({ length: 2503 }, (_, i) => i);
  const calls = [];
  const makeQuery = () => ({ range: async (from, to) => { calls.push([from, to]); return { data: source.slice(from, Math.min(to + 1, from + 1000)), error: null }; } });
  const rows = await fetchAllRows(makeQuery, { pageSize: 1000, max: 50000 });
  assert.equal(rows.length, 2503);
  assert.deepEqual(calls.map((c) => c[0]), [0, 1000, 2000]);
  await assert.rejects(() => fetchAllRows(makeQuery, { pageSize: 1000, max: 2000 }), /EXPORT_TOO_LARGE/);
  const failing = () => ({ range: async () => ({ data: null, error: Object.assign(new Error("boom"), { code: "X" }) }) });
  await assert.rejects(() => fetchAllRows(failing), /boom/);
});

test("subárbol de la opción B: solo Patentes Autorizadas de Off Street", async () => {
  const { subTree } = await import("./registry.mjs");
  const tree = subTree(["off-patentes"]);
  assert.deepEqual(tree.map((p) => p.id), ["off-street"]);
  assert.deepEqual(tree[0].categories.map((c) => c.id), ["off-patentes"]);
  assert.equal(flattenReports(tree).length, 11);
  assert.ok(flattenReports(tree).every((r) => r.status === REPORT_STATUS.AVAILABLE));
  assert.equal(subTree(null), REPORT_TREE);
});
