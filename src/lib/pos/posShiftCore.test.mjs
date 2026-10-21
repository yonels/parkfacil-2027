import test from "node:test";
import assert from "node:assert/strict";
import {
  PosShiftClosureError,
  calculateCashDifference,
  filterShiftPayments,
  summarizeShiftPayments,
  toPaymentSnapshotRow,
  toPendingVehicleRow,
  validateClosureInput,
} from "./posShiftCore.mjs";

const opened = "2026-08-17T13:00:00.000Z";
const closed = "2026-08-17T21:00:00.000Z";

test("CIERRE DE CAJA: atribuye pagos por parking + operador + ventana del turno", () => {
  const stays = [
    { id: "1", status: "PAID", parking_id: "p1", exit_operator_id: "op1", exit_at: "2026-08-17T14:00:00.000Z" }, // dentro
    { id: "2", status: "PAID", parking_id: "p1", exit_operator_id: "op2", exit_at: "2026-08-17T14:00:00.000Z" }, // otro operador
    { id: "3", status: "PAID", parking_id: "p2", exit_operator_id: "op1", exit_at: "2026-08-17T14:00:00.000Z" }, // otro parking
    { id: "4", status: "PAID", parking_id: "p1", exit_operator_id: "op1", exit_at: "2026-08-17T12:00:00.000Z" }, // antes de abrir
    { id: "5", status: "PAID", parking_id: "p1", exit_operator_id: "op1", exit_at: "2026-08-17T22:00:00.000Z" }, // después de cerrar
    { id: "6", status: "OPEN", parking_id: "p1", exit_operator_id: "op1", exit_at: null }, // no pagado
  ];
  const result = filterShiftPayments(stays, { operatorId: "op1", parkingId: "p1", openedAt: opened, closedAt: closed });
  assert.deepEqual(result.map((s) => s.id), ["1"]);
});

test("CIERRE DE CAJA: turno abierto (sin closedAt) atribuye hasta ahora", () => {
  const stays = [
    { id: "1", status: "PAID", parking_id: "p1", exit_operator_id: "op1", exit_at: new Date().toISOString() },
  ];
  const result = filterShiftPayments(stays, { operatorId: "op1", parkingId: "p1", openedAt: opened });
  assert.deepEqual(result.map((s) => s.id), ["1"]);
});

test("CIERRE DE CAJA: totales exactos con efectivo/débito/crédito", () => {
  const stays = [
    { total_amount: 10000, payment_method: "CASH" },
    { total_amount: 5500, payment_method: "CASH" },
    { total_amount: 3000, payment_method: "CARD" },
  ];
  const totals = summarizeShiftPayments(stays);
  assert.deepEqual(totals, {
    confirmedPaymentsCount: 3,
    cancelledPaymentsCount: 0,
    cashAmount: 15500,
    debitAmount: 0,
    creditAmount: 0,
    grossAmount: 18500,
    cancelledAmount: 0,
    netAmount: 18500,
  });
});

test("CIERRE DE CAJA: sin pagos, todo en cero", () => {
  assert.deepEqual(summarizeShiftPayments([]), {
    confirmedPaymentsCount: 0,
    cancelledPaymentsCount: 0,
    cashAmount: 0,
    debitAmount: 0,
    creditAmount: 0,
    grossAmount: 0,
    cancelledAmount: 0,
    netAmount: 0,
  });
});

test("CUADRE DE EFECTIVO: ejemplos exactos del requerimiento", () => {
  assert.equal(calculateCashDifference(125500, 125500), 0);
  assert.equal(calculateCashDifference(125000, 125500), -500);
  assert.equal(calculateCashDifference(126000, 125500), 500);
});

test("CUADRE DE EFECTIVO: sin diferencia, la observación es opcional", () => {
  const result = validateClosureInput({ declaredCashAmount: 125500, differenceObservation: "" }, 125500);
  assert.deepEqual(result, { declaredCashAmount: 125500, differenceObservation: "", cashDifference: 0 });
});

test("CUADRE DE EFECTIVO: con diferencia, exige observación", () => {
  assert.throws(
    () => validateClosureInput({ declaredCashAmount: 125000, differenceObservation: "" }, 125500),
    (error) => error instanceof PosShiftClosureError && error.code === "DIFFERENCE_OBSERVATION_REQUIRED"
  );
  assert.throws(
    () => validateClosureInput({ declaredCashAmount: 125000, differenceObservation: "   " }, 125500),
    (error) => error instanceof PosShiftClosureError && error.code === "DIFFERENCE_OBSERVATION_REQUIRED"
  );
});

test("CUADRE DE EFECTIVO: con diferencia y observación, queda registrada", () => {
  const result = validateClosureInput({ declaredCashAmount: 126000, differenceObservation: "Sobrante por vuelto no entregado." }, 125500);
  assert.deepEqual(result, { declaredCashAmount: 126000, differenceObservation: "Sobrante por vuelto no entregado.", cashDifference: 500 });
});

test("CUADRE DE EFECTIVO: efectivo declarado inválido se rechaza", () => {
  assert.throws(
    () => validateClosureInput({ declaredCashAmount: "abc", differenceObservation: "" }, 0),
    (error) => error instanceof PosShiftClosureError && error.code === "DECLARED_CASH_INVALID"
  );
  assert.throws(
    () => validateClosureInput({ declaredCashAmount: -100, differenceObservation: "" }, 0),
    (error) => error instanceof PosShiftClosureError && error.code === "DECLARED_CASH_INVALID"
  );
});

test("VEHÍCULOS PENDIENTES / RECIBO: proyecciones mínimas correctas", () => {
  const paymentRow = toPaymentSnapshotRow({
    id: "s1", license_plate: "CXPY-93", code: "ING-1", exit_at: "2026-08-17T14:00:00.000Z",
    payment_method: "CASH", total_amount: 2500, exit_operator_id: "op1",
  });
  assert.deepEqual(paymentRow, {
    stayId: "s1", plate: "CXPY-93", ticket: "ING-1", exitAt: "2026-08-17T14:00:00.000Z",
    paymentMethod: "CASH", amount: 2500, operatorId: "op1",
  });

  const pendingRow = toPendingVehicleRow(
    { id: "s2", license_plate: "UUUU-22", code: "ING-2", entry_at: "2026-08-17T14:00:00.000Z" },
    new Date("2026-08-17T14:45:00.000Z")
  );
  assert.deepEqual(pendingRow, {
    stayId: "s2", plate: "UUUU-22", ticket: "ING-2", entryAt: "2026-08-17T14:00:00.000Z", elapsedMinutes: 45,
  });
});
