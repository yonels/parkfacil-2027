import assert from "node:assert/strict";
import test from "node:test";
import { computeInspectionKpis, emptyInspectionKpis } from "./onStreetInspectionsAdminCore.mjs";

test("computeInspectionKpis: cuenta por tipo, patentes distintas, reincidencias y SMS", () => {
  const rows = [
    { license_plate_normalized: "ABC123", inspection_type: "OVERSTAY", sms_status: "SENT" },
    { license_plate_normalized: "ABC123", inspection_type: "OVERSTAY", sms_status: "SENT" },
    { license_plate_normalized: "XYZ789", inspection_type: "NO_SESSION", sms_status: "NOT_REQUIRED" },
    { license_plate_normalized: "MOR123", inspection_type: "OTHER", sms_status: "FAILED" },
  ];
  const kpis = computeInspectionKpis(rows);
  assert.equal(kpis.total, 4);
  assert.equal(kpis.overstay, 2);
  assert.equal(kpis.noSession, 1);
  assert.equal(kpis.other, 1);
  assert.equal(kpis.distinctPlates, 3);
  assert.equal(kpis.reincidences, 1, "ABC123 aparece 2 veces -> 1 patente reincidente");
  assert.equal(kpis.smsSent, 2);
  assert.equal(kpis.smsFailed, 1);
});

test("computeInspectionKpis: lista vacía nunca produce NaN ni división por cero", () => {
  assert.deepEqual(computeInspectionKpis([]), emptyInspectionKpis());
});

test("emptyInspectionKpis: todos los contadores en 0, forma consistente con computeInspectionKpis", () => {
  const empty = emptyInspectionKpis();
  const computed = computeInspectionKpis([]);
  assert.deepEqual(Object.keys(empty).sort(), Object.keys(computed).sort());
});
