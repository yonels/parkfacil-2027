import test from "node:test";
import assert from "node:assert/strict";
import {
  DebtInputError, buildDebtNotice, canManageDebts, canRevertUnpaidMark, mapDebtRow,
  normalizeDebtPlate, resolveDebtChannel, sanitizeUnpaidNotes, validatePayDebtInput, validateWaiveDebtInput,
} from "./parkingDebtsCore.mjs";

test("patente normalizada como en parking_stays", () => {
  assert.equal(normalizeDebtPlate("abcd12"), "ABCD-12");
  assert.equal(normalizeDebtPlate("AB CD-12"), "ABCD-12");
  assert.equal(normalizeDebtPlate("ABC12"), null);
  assert.equal(normalizeDebtPlate(""), null);
});

test("observación de salida sin pago: espacios colapsados y máximo 300", () => {
  assert.equal(sanitizeUnpaidNotes("  se   fue \n rápido "), "se fue rápido");
  assert.equal(sanitizeUnpaidNotes("x".repeat(400)).length, 300);
});

test("marcar pagada exige medio válido; referencia opcional acotada", () => {
  assert.deepEqual(validatePayDebtInput({ method: "transfer", reference: " 123 " }), { method: "TRANSFER", reference: "123" });
  assert.deepEqual(validatePayDebtInput({ method: "CASH" }), { method: "CASH", reference: null });
  assert.throws(() => validatePayDebtInput({ method: "BITCOIN" }), DebtInputError);
  assert.throws(() => validatePayDebtInput({ method: "CASH", reference: "x".repeat(121) }), DebtInputError);
});

test("condonar exige motivo no vacío (D9)", () => {
  assert.deepEqual(validateWaiveDebtInput({ reason: "  error de patente " }), { reason: "error de patente" });
  assert.throws(() => validateWaiveDebtInput({ reason: "   " }), /motivo/);
  assert.throws(() => validateWaiveDebtInput({ reason: "x".repeat(301) }), DebtInputError);
});

test("solo administradores gestionan deudas; el operador no condona", () => {
  assert.equal(canManageDebts("company_admin"), true);
  assert.equal(canManageDebts("platform_admin"), true);
  assert.equal(canManageDebts("operator"), false);
  assert.equal(canManageDebts(undefined), false);
});

test("revertir la marca: quien la hizo o un administrador, solo si sigue pendiente", () => {
  const stay = { status: "UNPAID_PENDING", unpaid_marked_by: "op-1" };
  assert.equal(canRevertUnpaidMark({ stay, actorId: "op-1", isAdmin: false }), true);
  assert.equal(canRevertUnpaidMark({ stay, actorId: "op-2", isAdmin: false }), false);
  assert.equal(canRevertUnpaidMark({ stay, actorId: "op-2", isAdmin: true }), true);
  assert.equal(canRevertUnpaidMark({ stay: { ...stay, status: "UNPAID_EXIT" }, actorId: "op-1", isAdmin: true }), false);
});

test("canal según portal", () => {
  assert.equal(resolveDebtChannel(true), "POS");
  assert.equal(resolveDebtChannel(false), "WEB");
});

test("aviso de deuda: solo pendientes, suma y detalle", () => {
  assert.equal(buildDebtNotice([]), null);
  assert.equal(buildDebtNotice([{ status: "PAID", amount: 100 }]), null);
  const notice = buildDebtNotice([
    { id: "d1", status: "PENDING", amount: 4200, licensePlate: "ABCD-12", parkingName: "Central", exitAt: "2026-10-07T23:00:00Z", createdAt: "2026-10-07T23:00:01Z" },
    { id: "d2", status: "PENDING", amount: 13600, licensePlate: "ABCD-12", parkingName: "Norte", exitAt: null, createdAt: "2026-10-08T23:00:01Z" },
    { id: "d3", status: "WAIVED", amount: 999, licensePlate: "ABCD-12" },
  ]);
  assert.equal(notice.count, 2);
  assert.equal(notice.total, 17800);
  assert.equal(notice.plate, "ABCD-12");
  assert.deepEqual(notice.debts.map((d) => d.id), ["d1", "d2"]);
});

test("mapeo de fila de deuda con estadía y estacionamiento", () => {
  const debt = mapDebtRow({ id: "d1", company_id: "C", parking_id: "P", stay_id: "S", license_plate: "ABCD-12", net_amount: 3529, tax_amount: 671, amount: 4200, status: "PENDING", notes: "", created_at: "t", parking: { name: "Central" }, stay: { code: "ING-1", exit_at: "e", unpaid_marked_by_name: "op" } });
  assert.equal(debt.parkingName, "Central");
  assert.equal(debt.stayCode, "ING-1");
  assert.equal(debt.statusLabel, "Pendiente");
  assert.equal(debt.markedByName, "op");
  assert.equal(mapDebtRow(null), null);
});
