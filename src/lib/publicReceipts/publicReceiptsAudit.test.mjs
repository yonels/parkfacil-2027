import test from "node:test";
import assert from "node:assert/strict";
import { hashPublicReceiptsPlate, buildPublicReceiptsAuditEntry } from "./publicReceiptsAudit.mjs";

test("la patente nunca queda en claro en el registro de auditoría", () => {
  const entry = buildPublicReceiptsAuditEntry({ plate: "CXPY-93", resultCount: 4, now: new Date("2026-11-13T12:00:00Z") });
  assert.equal(entry.plate_hash.length, 64); // sha256 hex
  assert.ok(!JSON.stringify(entry).includes("CXPY-93"));
  assert.equal(entry.result_count, 4);
  assert.equal(entry.queried_at, "2026-11-13T12:00:00.000Z");
});

test("el hash es estable para la misma patente y distinto para otra", () => {
  assert.equal(hashPublicReceiptsPlate("CXPY-93"), hashPublicReceiptsPlate("CXPY-93"));
  assert.notEqual(hashPublicReceiptsPlate("CXPY-93"), hashPublicReceiptsPlate("KXPT-42"));
});

test("result_count no numérico se guarda como 0", () => {
  assert.equal(buildPublicReceiptsAuditEntry({ plate: "CXPY-93", resultCount: "no-es-numero" }).result_count, 0);
});
