import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  agreementReportRow,
  authorizationOverlapsRange,
  historyReportRow,
  MAX_REPORT_DAYS,
  parseReportRange,
  sortHistoryRows,
  stayReportRow,
  summarizeEventValues,
} from "./reportCore.mjs";

const authorization = {
  id: "a1", licensePlate: "QAPL-01", beneficiaryName: "Ana Pérez", beneficiaryReference: "RUT 1-9",
  kind: "CONTINUOUS", validFrom: "2026-10-01T03:00:00.000Z", validTo: "2026-11-01T03:00:00.000Z", schedule: [],
  terms: { billingUnit: "MONTH", quantity: 1, unitPrice: 30000, totalAmount: 30000, netAmount: 25210, taxAmount: 4790 },
  status: "ACTIVE", version: 2, revokedReason: null,
};

test("rango local de Chile, ambos días incluidos", () => {
  const range = parseReportRange("2026-10-01", "2026-10-31");
  assert.equal(range.fromIso, "2026-10-01T03:00:00.000Z");
  assert.equal(range.toIso, "2026-11-01T03:00:00.000Z");
  assert.ok(parseReportRange("2026-10-31", "2026-10-01").error);
  assert.ok(parseReportRange("", "2026-10-01").error);
  assert.ok(parseReportRange("2025-01-01", "2026-10-01").error, `máximo ${MAX_REPORT_DAYS} días`);
  assert.equal(parseReportRange("2026-10-18", "2026-10-18").error, undefined, "un solo día es válido");
});

test("estadía liberada: minutos cubiertos/cobrados, excedente y medio", () => {
  const byId = new Map([["a1", authorization]]);
  const free = stayReportRow({ id: "s1", code: "T1", license_plate: "QAPL-01", status: "PAID", entry_at: "2026-10-18T13:00:00Z", exit_at: "2026-10-18T14:00:00Z", released_covered_seconds: 3599, released_chargeable_seconds: 0, total_amount: 0, payment_method: null, released_payment_authorization_id: "a1" }, byId);
  assert.equal(free.beneficiary, "Ana Pérez");
  assert.equal(free.coveredMinutes, 59, "minutos completos, sin redondear hacia arriba");
  assert.equal(free.chargedMinutes, 0);
  assert.equal(free.amount, 0);
  assert.equal(free.method, "Liberado (sin cobro)");
  const paid = stayReportRow({ id: "s2", status: "PAID", license_plate: "QAPL-01", entry_at: "2026-10-18T13:00:00Z", released_chargeable_seconds: 2400, total_amount: 800, payment_method: "CASH", released_payment_authorization_id: "a1" }, byId);
  assert.equal(paid.amount, 800);
  assert.equal(paid.method, "Efectivo");
  const open = stayReportRow({ id: "s3", status: "OPEN", license_plate: "QAPL-01", entry_at: "2026-10-18T13:00:00Z", total_amount: 0, released_covered_seconds: null, released_payment_authorization_id: "x" }, byId);
  assert.equal(open.status, "En el estacionamiento");
  assert.equal(open.amount, null, "una estadía abierta no tiene monto final");
  assert.equal(open.method, "");
  assert.equal(open.coveredMinutes, null);
  assert.equal(open.beneficiary, "");
});

test("acuerdo: pagado, pendiente y pagos anulados", () => {
  const payments = [
    { id: "p1", authorizationId: "a1", status: "VOIDED", amount: 30000, method: "CASH", voidedAt: "2026-10-02T12:00:00Z", voidReason: "Monto mal digitado" },
    { id: "p2", authorizationId: "a1", status: "REGISTERED", amount: 30000, method: "TRANSFER", paidAt: "2026-10-02T13:00:00Z", reference: "TRX-9", createdByEmail: "admin@empresa.cl" },
    { id: "p3", authorizationId: "otra", status: "REGISTERED", amount: 1, method: "CASH" },
  ];
  const row = agreementReportRow(authorization, payments);
  assert.equal(row.paymentStatus, "Pagada");
  assert.equal(row.agreedAmount, 30000);
  assert.equal(row.paidAmount, 30000);
  assert.equal(row.paymentMethod, "Transferencia");
  assert.equal(row.paymentReference, "TRX-9");
  assert.equal(row.voidedPayments, 1);
  assert.equal(row.lastVoidReason, "Monto mal digitado");
  assert.equal(row.quantity, "1 mes");
  assert.equal(row.authorizationStatus, "Activa (v2)");
  const pending = agreementReportRow({ ...authorization, status: "REVOKED", revokedReason: "Dejó de trabajar" }, []);
  assert.equal(pending.paymentStatus, "Pago pendiente");
  assert.equal(pending.paidAmount, null);
  assert.equal(pending.authorizationStatus, "Revocada: Dejó de trabajar");
});

test("acuerdos: vigencia que toca el rango", () => {
  assert.equal(authorizationOverlapsRange(authorization, "2026-10-15T03:00:00.000Z", "2026-10-16T03:00:00.000Z"), true);
  assert.equal(authorizationOverlapsRange(authorization, "2026-11-01T03:00:00.000Z", "2026-11-02T03:00:00.000Z"), false, "termina justo al inicio del rango");
  assert.equal(authorizationOverlapsRange(authorization, "2026-09-01T03:00:00.000Z", "2026-10-01T03:00:00.000Z"), false, "comienza justo al final del rango");
});

test("historial: actor, patente, antes/después legibles y orden descendente", () => {
  const plates = new Map([["a1", "QAPL-01"]]);
  const older = historyReportRow({ id: "e1", event_type: "PAYMENT_REGISTERED", authorization_id: "a1", previous_values: {}, new_values: { amount: 30000, method: "CASH", paid_at: "2026-10-02T13:00:00Z", status: "REGISTERED" }, reason: "Pago recibido", actor_email: "admin@empresa.cl", actor_role: "company_admin", created_at: "2026-10-02T13:00:00Z" }, plates);
  const newer = historyReportRow({ id: "e2", event_type: "SPOTS_CHANGED", previous_values: { operational_spots: 2 }, new_values: { operational_spots: 3 }, reason: "Más cupos", actor_email: "root@parkfacil.cl", actor_role: "platform_admin", created_at: "2026-10-03T13:00:00Z" }, plates);
  assert.equal(older.event, "Pago del beneficiario registrado");
  assert.equal(older.plate, "QAPL-01");
  assert.equal(older.scope, "Autorización");
  assert.equal(older.actor, "admin@empresa.cl (Administrador)");
  assert.equal(older.before, "—");
  assert.match(older.after, /Efectivo/);
  assert.equal(newer.actor, "root@parkfacil.cl (Root)");
  assert.equal(newer.before, "2 cupos");
  assert.equal(newer.after, "3 cupos");
  assert.deepEqual(sortHistoryRows([older, newer]).map((row) => row.id), ["e2", "e1"]);
  assert.equal(summarizeEventValues({ enabled: false }), "Desactivado");
});

test("contrato: la ruta es de solo lectura y exige permiso de lectura con alcance", () => {
  const route = readFileSync(new URL("../../app/api/pago-liberado/estacionamientos/[parkingId]/reportes/route.js", import.meta.url), "utf8");
  assert.match(route, /authorizeReleasedPayment\(request, "read"\)/);
  assert.match(route, /requireScopedParking/);
  assert.doesNotMatch(route, /\.(insert|update|upsert|delete|rpc)\(/, "sin escrituras");
  assert.doesNotMatch(route, /export async function (POST|PATCH|PUT|DELETE)/);
});
