import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { describeRegularization, regularizationFromDb, regularizationOptions, summarizeStayValues, validateRegularizationInput } from "./regularizationCore.mjs";
import { regularizationHistoryRow, stayReportRow } from "./reportCore.mjs";

const NOW = Date.parse("2026-10-18T15:00:00.000Z"); // 12:00 en Chile (UTC-3)
const openStay = { id: "s1", status: "OPEN", entry_at: "2026-10-18T13:00:00.000Z", released_payment_authorization_id: "a1" };

test("cerrar abierta: exige salida entre el ingreso y ahora, y motivo", () => {
  const ok = validateRegularizationInput({ action: "CLOSE_OPEN", exitAt: "2026-10-18T11:30", reason: "Salió sin registrar" }, { stay: openStay, now: NOW });
  assert.deepEqual(ok.value, { action: "CLOSE_OPEN", exitAt: "2026-10-18T14:30:00.000Z", reason: "Salió sin registrar" });
  assert.ok(validateRegularizationInput({ action: "CLOSE_OPEN", exitAt: "2026-10-18T09:59", reason: "motivo" }, { stay: openStay, now: NOW }).errors, "antes del ingreso");
  assert.ok(validateRegularizationInput({ action: "CLOSE_OPEN", exitAt: "2026-10-18T13:00", reason: "motivo" }, { stay: openStay, now: NOW }).errors, "futura");
  assert.equal(validateRegularizationInput({ action: "CLOSE_OPEN", exitAt: "2026-10-18T12:04", reason: "motivo" }, { stay: openStay, now: NOW }).errors, undefined, "tolerancia de 5 minutos");
  assert.ok(validateRegularizationInput({ action: "CLOSE_OPEN", exitAt: "", reason: "motivo" }, { stay: openStay, now: NOW }).errors);
  assert.ok(validateRegularizationInput({ action: "CLOSE_OPEN", exitAt: "2026-10-18T11:30", reason: " x " }, { stay: openStay, now: NOW }).errors, "motivo corto");
});

test("anular beneficio no usa hora de salida; acción inválida rechazada", () => {
  const ok = validateRegularizationInput({ action: "VOID_BENEFIT", exitAt: "2026-10-18T11:30", reason: "Mal aplicado" }, { stay: openStay, now: NOW });
  assert.equal(ok.value.exitAt, null);
  assert.ok(validateRegularizationInput({ action: "REFUND", reason: "motivo" }, { stay: openStay, now: NOW }).errors);
  assert.equal(validateRegularizationInput({ action: "VOID_BENEFIT", reason: "x".repeat(900) }, { stay: openStay }).value.reason.length, 500);
});

test("opciones por estado de la estadía", () => {
  assert.deepEqual(regularizationOptions(openStay, []), { canClose: true, canVoid: true });
  assert.deepEqual(regularizationOptions({ ...openStay, status: "PAID" }, []), { canClose: false, canVoid: true });
  assert.deepEqual(regularizationOptions({ ...openStay, status: "PAID" }, [{ stayId: "s1", action: "VOID_BENEFIT" }]), { canClose: false, canVoid: false });
  assert.deepEqual(regularizationOptions({ ...openStay, released_payment_authorization_id: null }, []), { canClose: false, canVoid: false });
  assert.deepEqual(regularizationOptions({ ...openStay, status: "CANCELLED" }, []), { canClose: false, canVoid: false });
});

test("descripción, resumen de estadía y fila de historial", () => {
  const row = regularizationFromDb({
    id: "r1", stay_id: "s1", parking_id: "p1", authorization_id: "a1", license_plate: "QAPL-01", action: "CLOSE_OPEN", stay_status_before: "OPEN",
    exit_at: "2026-10-18T14:30:00.000Z", previous_values: { status: "OPEN", released_payment_authorization_id: "a1" },
    new_values: { status: "PAID", exit_at: "2026-10-18T14:30:00.000Z", total_amount: 0, payment_code: "REG-1", released_payment_authorization_id: "a1" },
    reason: "Salió sin registrar", actor_email: "admin@empresa.cl", actor_role: "company_admin", created_at: "2026-10-18T15:00:00.000Z",
  });
  assert.equal(describeRegularization(row), "Estadía cerrada por regularización · salida 18-10-2026 11:30");
  assert.equal(describeRegularization({ action: "VOID_BENEFIT", stayStatusBefore: "PAID" }), "Beneficio anulado (ya había salido: sin cambios de dinero)");
  assert.equal(summarizeStayValues(row.previousValues), "Abierta · con beneficio");
  assert.equal(summarizeStayValues(row.newValues), "Cerrada · salida 18-10-2026 11:30 · $0 · REG-1 · con beneficio");
  const history = regularizationHistoryRow(row);
  assert.equal(history.scope, "Estadía");
  assert.equal(history.actor, "admin@empresa.cl (Administrador)");
  assert.equal(history.plate, "QAPL-01");
});

test("reporte de estadías: cierre por regularización y beneficio anulado en abierta", () => {
  const auth = new Map([["a1", { id: "a1", beneficiaryName: "Ana" }]]);
  const regs = new Map([["s1", [{ stayId: "s1", action: "CLOSE_OPEN", authorizationId: "a1" }]], ["s2", [{ stayId: "s2", action: "VOID_BENEFIT", authorizationId: "a1" }]]]);
  const closed = stayReportRow({ id: "s1", status: "PAID", license_plate: "QAPL-01", total_amount: 0, payment_method: null, payment_code: "REG-1", released_payment_authorization_id: "a1" }, auth, regs);
  assert.equal(closed.method, "Regularización (sin cobro)");
  assert.equal(closed.regularization, "Estadía cerrada por regularización");
  const voidedOpen = stayReportRow({ id: "s2", status: "OPEN", license_plate: "QAPL-02", total_amount: null, released_payment_authorization_id: null }, auth, regs);
  assert.equal(voidedOpen.beneficiary, "Ana", "el beneficiario se recupera desde la regularización");
  assert.equal(voidedOpen.regularization, "Beneficio anulado");
});

test("contrato: la ruta exige administrador, valida y llama a la RPC", () => {
  const route = readFileSync(new URL("../../app/api/pago-liberado/estacionamientos/[parkingId]/estadias/[stayId]/regularizacion/route.js", import.meta.url), "utf8");
  assert.match(route, /authorizeReleasedPayment\(request, "admin"\)/);
  assert.match(route, /requireScopedParking/);
  assert.match(route, /validateRegularizationInput/);
  assert.match(route, /rpc\("released_payment_regularize_stay"/);
  assert.doesNotMatch(route, /\.(insert|update|upsert|delete)\(/, "escribe solo por la RPC");
  const migration = readFileSync(new URL("../../../supabase/migrations/20261018150000_released_payment_stage3_regularization.sql", import.meta.url), "utf8");
  assert.match(migration, /payment_shift_id = null/, "el cierre no entra a ningún turno");
  assert.match(migration, /total_amount = 0/);
  assert.match(migration, /grant execute on function public\.released_payment_regularize_stay\(uuid, uuid, uuid, text, timestamptz, text\) to service_role/);
});
