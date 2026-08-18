import assert from "node:assert/strict";
import test from "node:test";
import { classifyPosShift, validatePosClosureInput } from "./posOperatorShiftCore.mjs";

test("estado POS prioriza el turno OPEN", () => {
  const open = { id: "open" };
  assert.deepEqual(classifyPosShift(open, { id: "programmed" }), { state: "OPEN", shift: open });
});

test("estado POS ofrece PROGRAMMED y representa ausencia sin error", () => {
  const programmed = { id: "programmed" };
  assert.deepEqual(classifyPosShift(null, programmed), { state: "PROGRAMMED", shift: programmed });
  assert.deepEqual(classifyPosShift(null, null), { state: "UNASSIGNED", shift: null });
});

test("estado POS conserva el cierre del día para consulta", () => {
  const closed = { id: "closed", status: "CLOSED" };
  assert.deepEqual(classifyPosShift(null, null, closed), { state: "CLOSED", shift: closed });
});

test("cierre exige efectivo válido y observación ante diferencia", () => {
  assert.equal(validatePosClosureInput({ declaredCashAmount: -1 }, 0).code, "INVALID_DECLARED_CASH");
  assert.equal(validatePosClosureInput({ declaredCashAmount: 900 }, 1000).code, "DIFFERENCE_OBSERVATION_REQUIRED");
  assert.deepEqual(validatePosClosureInput({ declaredCashAmount: 900, differenceObservation: "Faltante" }, 1000), {
    ok: true, declaredCashAmount: 900, differenceObservation: "Faltante", difference: -100,
  });
});
