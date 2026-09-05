import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCsvContent,
  elapsedMinutesSince,
  sanitizeCsvCell,
  shiftStatusLabel,
  toOccupancyReportRow,
  toShiftReportRow,
  validateReportsFilters,
} from "./offStreetReportsCore.mjs";

test("validateReportsFilters rechaza type/fechas/estado fuera del modelo real", () => {
  assert.equal(validateReportsFilters({}).ok, true);
  assert.equal(validateReportsFilters({ type: "movements" }).ok, true);
  assert.equal(validateReportsFilters({ type: "invented" }).ok, false);
  assert.equal(validateReportsFilters({ dateFrom: "2026-07-05", dateTo: "2026-07-01" }).ok, false);
  assert.equal(validateReportsFilters({ status: "OPEN" }).ok, true);
  assert.equal(validateReportsFilters({ status: "DONE" }).ok, false);
});

test("CSV INJECTION: celdas que empiezan con =, +, -, @ se neutralizan con comilla simple", () => {
  assert.equal(sanitizeCsvCell("=SUM(A1:A9)"), "'=SUM(A1:A9)");
  assert.equal(sanitizeCsvCell("+1234"), "'+1234");
  assert.equal(sanitizeCsvCell("-1234"), "'-1234");
  assert.equal(sanitizeCsvCell("@example"), "'@example");
  assert.equal(sanitizeCsvCell("ABCD-12"), "ABCD-12"); // dato real normal, sin alterar
  assert.equal(sanitizeCsvCell(null), "");
});

test("buildCsvContent produce filas separadas por ; con BOM UTF-8 y celdas escapadas", () => {
  const csv = buildCsvContent(["Patente", "Monto"], [["ABCD-12", 1500], ["=EVIL()", 0]]);
  assert.ok(csv.startsWith("﻿")); // BOM
  assert.ok(csv.includes('"ABCD-12";"1500"'));
  assert.ok(csv.includes("\"'=EVIL()\""), "una fórmula debe quedar neutralizada dentro del CSV");
});

test("elapsedMinutesSince calcula minutos transcurridos reales, nunca negativos", () => {
  assert.equal(elapsedMinutesSince("2026-07-24T14:00:00.000Z", new Date("2026-07-24T15:30:00.000Z")), 90);
  assert.equal(elapsedMinutesSince(null, new Date()), null);
  // "now" anterior a entry_at (reloj desincronizado) nunca da un elapsed negativo.
  assert.equal(elapsedMinutesSince("2026-07-24T15:00:00.000Z", new Date("2026-07-24T14:00:00.000Z")), 0);
});

test("shiftStatusLabel cubre los 5 estados reales de operator_shifts", () => {
  assert.equal(shiftStatusLabel("OPEN"), "Abierto");
  assert.equal(shiftStatusLabel("CLOSING"), "En cierre");
  assert.equal(shiftStatusLabel("CLOSED"), "Cerrado");
  assert.equal(shiftStatusLabel("PROGRAMMED"), "Programado");
  assert.equal(shiftStatusLabel("CANCELLED"), "Anulado");
});

test("toShiftReportRow mapea la fila real, con entryCount/revenueAmount ya resueltos por lote (no heurística)", () => {
  const row = toShiftReportRow(
    { id: "sh1", operator_id: "op-1", parking_id: "p-1", shift_date: "2026-07-24", opened_at: "2026-07-24T12:00:00Z", closed_at: "2026-07-24T20:00:00Z", status: "CLOSED" },
    { parkingName: "Parking Centro", companyName: "Empresa X", operatorName: "Ana", entryCount: 12, revenueAmount: 45000 },
  );
  assert.equal(row.operator, "Ana");
  assert.equal(row.status, "CLOSED");
  assert.equal(row.entryCount, 12);
  assert.equal(row.revenueAmount, 45000);
});

test("toShiftReportRow cae al operator_id real cuando no hay nombre resuelto (nunca inventa un nombre)", () => {
  const row = toShiftReportRow({ id: "sh1", operator_id: "op-123", status: "OPEN" }, {});
  assert.equal(row.operator, "op-123");
});

test("toOccupancyReportRow reutiliza computeOccupancy (Fase 3) -- misma fórmula, misma protección de división por cero", () => {
  const row = toOccupancyReportRow({ id: "p-1", name: "Parking Centro", companyName: "Empresa X" }, { capacity: 100, insideCount: 25 });
  assert.equal(row.capacity, 100);
  assert.equal(row.available, 75);
  assert.equal(row.occupancyPercentage, 25);
  assert.equal(row.capacityKnown, true);

  const unknown = toOccupancyReportRow({ id: "p-2", name: "Parking Sur" }, { capacity: 0, insideCount: 3 });
  assert.equal(unknown.capacityKnown, false);
  assert.equal(unknown.available, null);
});
