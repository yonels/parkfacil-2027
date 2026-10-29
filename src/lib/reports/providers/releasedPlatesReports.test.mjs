import test from "node:test";
import assert from "node:assert/strict";
import { buildHistoryReport, buildOrganizationReport, buildPlateListReport, buildUsageReport } from "./releasedPlatesReports.mjs";
import { resolvePeriod } from "../engine/periodCore.mjs";

const now = Date.parse("2026-10-29T01:30:00Z"); // 28-10-2026 22:30 Chile
const month = resolvePeriod("mes", { now });
const kpi = (report) => Object.fromEntries(report.kpis.map((k) => [k.key, k.value]));
const auth = (id, extra = {}) => ({
  id, displayPlate: `PL${id}A-11`.slice(0, 7), status: "ACTIVE", validFrom: "2026-10-28T11:00:00Z", validTo: "2026-10-30T11:00:00Z",
  durationQuantity: 2, durationUnit: "DAY", beneficiaryName: `Ben ${id}`, beneficiaryRut: "12.345.678-5", beneficiaryPhone: "+56 9 1234 5678",
  beneficiaryEmail: "a@b.cl", reason: "R", modality: "FREE", thirdParty: null, usageMode: "MULTIPLE", maxUses: null, usesCount: 0,
  createdByEmail: "admin@x.cl", createdAt: "2026-10-27T11:00:00Z", updatedByEmail: "admin@x.cl", finishedAt: null, deletedAt: null, ...extra,
});
const set = [
  auth("1"), // vigente hasta 30-10 (vence en < 7 días)
  auth("2", { validFrom: "2026-11-05T11:00:00Z", validTo: "2026-12-30T11:00:00Z" }), // programada
  auth("3", { validFrom: "2026-10-10T11:00:00Z", validTo: "2026-10-12T11:00:00Z" }), // vencida en octubre
  auth("4", { maxUses: 2, usesCount: 2, usageMode: "MAX" }), // usos agotados
  auth("5", { status: "FINISHED", finishedAt: "2026-10-20T15:00:00Z", validFrom: "2026-10-19T11:00:00Z", validTo: "2026-10-20T15:00:00Z", updatedByEmail: "jefe@x.cl" }),
  auth("6", { status: "DELETED", deletedAt: "2026-10-21T15:00:00Z", updatedByEmail: "jefe@x.cl" }),
  auth("7", { modality: "THIRD_PARTY", thirdParty: { name: "Conv SpA", rut: "76.123.456-0", email: "f@c.cl", amount: 2.5, currency: "UF" }, usesCount: 3, validTo: "2026-11-20T11:00:00Z" }),
  auth("8", { modality: "THIRD_PARTY", thirdParty: { name: "Conv SpA", rut: "76.123.456-0", email: "f@c.cl", amount: 1.5, currency: "UF" }, validTo: "2026-11-25T11:00:00Z" }),
  auth("9", { modality: "THIRD_PARTY", thirdParty: { name: "Muni", rut: "69.070.100-9", email: "m@c.cl", amount: 40000, currency: "CLP" }, validTo: "2026-12-31T11:00:00Z" }),
];
const ids = (report) => report.rows.map((row) => row.id).sort();

test("gratuitas y cobradas a terceros (montos por moneda)", () => {
  assert.deepEqual(ids(buildPlateListReport({ authorizations: set, period: month, now, scope: "free" })), ["1", "3", "4", "5"]);
  const third = buildPlateListReport({ authorizations: set, period: month, now, scope: "thirdParty" });
  assert.deepEqual(ids(third), ["7", "8", "9"]);
  assert.equal(kpi(third).thirdPartyUf, 4);
  assert.equal(kpi(third).thirdPartyClp, 40000);
});

test("vigentes, programadas y próximos vencimientos (estado a la emisión)", () => {
  assert.deepEqual(ids(buildPlateListReport({ authorizations: set, period: month, now, scope: "current" })), ["1", "7", "8", "9"]);
  const scheduled = buildPlateListReport({ authorizations: set, period: month, now, scope: "scheduled" });
  assert.deepEqual(ids(scheduled), ["2"]);
  assert.ok(scheduled.columns.some((c) => c.key === "hoursToStart"));
  assert.deepEqual(ids(buildPlateListReport({ authorizations: set, period: month, now, scope: "expiring", filters: { window: 7 } })), ["1"]);
  const thirty = buildPlateListReport({ authorizations: set, period: month, now, scope: "expiring", filters: { window: 30 } });
  assert.deepEqual(thirty.rows.map((r) => r.id), ["1", "7", "8"]); // ordenadas por término
});

test("vencidas y finalizadas/eliminadas por fecha dentro del período", () => {
  assert.deepEqual(ids(buildPlateListReport({ authorizations: set, period: month, now, scope: "expired" })), ["3", "4"]);
  const closed = buildPlateListReport({ authorizations: set, period: month, now, scope: "closed" });
  assert.deepEqual(ids(closed), ["5", "6"]);
  assert.equal(closed.rows.find((r) => r.id === "6").closedBy, "jefe@x.cl");
  const september = resolvePeriod("personalizado", { from: "2026-09-01", to: "2026-09-30", now });
  assert.equal(buildPlateListReport({ authorizations: set, period: september, now, scope: "closed" }).rows.length, 0);
});

test("por organización: agrupa terceros, separa sin costo y no suma monedas", () => {
  const report = buildOrganizationReport({ authorizations: set, period: month, now });
  const conv = report.rows.find((r) => r.organization === "Conv SpA");
  assert.equal(conv.plates, 2);
  assert.equal(conv.amountUf, 4);
  assert.equal(conv.entries, 3);
  assert.equal(report.rows.find((r) => r.id === "FREE").plates, 4); // 1,3,4,5 (6 eliminada fuera)
  assert.equal(kpi(report).organizations, 2);
  assert.equal(kpi(report).amountClp, 40000);
});

test("historial por patente con filtro", () => {
  const events = [
    { authorizationId: "7", type: "CREATED", at: "2026-10-27T11:00:00Z", actorEmail: "admin@x.cl" },
    { authorizationId: "7", type: "USED", at: "2026-10-28T12:00:00Z", parkingName: "Centro", useNumber: 1, stayCode: "ING-1" },
    { authorizationId: "1", type: "CREATED", at: "2026-10-27T10:00:00Z" },
    { authorizationId: "zz", type: "CREATED", at: "2026-10-27T10:00:00Z" }, // de otra empresa: se descarta
  ];
  const all = buildHistoryReport({ authorizations: set, events });
  assert.equal(all.rows.length, 3);
  assert.equal(kpi(all).used, 1);
  const only7 = buildHistoryReport({ authorizations: set, events, filters: { plate: set[6].displayPlate } });
  assert.equal(only7.rows.length, 2);
  assert.equal(only7.rows[0].detail, "Uso 1 · ticket ING-1");
});

test("uso del beneficio: minutos, excedente y estadías abiertas no calculables", () => {
  const stays = [
    { id: "s1", code: "ING-1", parking_id: "p1", license_plate: "PL7A-11", status: "PAID", entry_at: "2026-10-28T12:00:00Z", exit_at: "2026-10-28T14:30:00Z", total_amount: 600, released_plate_authorization_id: "7", released_covered_seconds: 7200, released_chargeable_seconds: 1800 },
    { id: "s2", code: "ING-2", parking_id: "p1", license_plate: "PL1A-11", status: "PAID", entry_at: "2026-10-27T12:00:00Z", exit_at: "2026-10-27T13:00:00Z", total_amount: 0, released_plate_authorization_id: "1", released_covered_seconds: 3600, released_chargeable_seconds: 0 },
    { id: "s3", code: "ING-3", parking_id: "p2", license_plate: "PL1A-11", status: "OPEN", entry_at: "2026-10-28T20:00:00Z", exit_at: null, total_amount: null, released_plate_authorization_id: "1", released_covered_seconds: null, released_chargeable_seconds: null },
  ];
  const report = buildUsageReport({ stays, authorizations: set, parkingsById: new Map([["p1", "Centro"], ["p2", "Sur"]]) });
  const k = kpi(report);
  assert.equal(k.entries, 3);
  assert.equal(k.plates, 2);
  assert.equal(k.inside, 1);
  assert.equal(k.covered, 180);
  assert.equal(k.charged, 30);
  assert.equal(k.excess, 600);
  assert.equal(report.rows.find((r) => r.id === "s3").coveredMinutes, null);
  assert.equal(report.notCalculable.length, 1);
  assert.equal(report.rows.find((r) => r.id === "s1").thirdPartyName, "Conv SpA");
});
