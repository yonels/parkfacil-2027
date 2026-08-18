export function classifyPosShift(openShift, programmedShift, closedShift = null) {
  if (openShift) return { state: "OPEN", shift: openShift };
  if (programmedShift) return { state: "PROGRAMMED", shift: programmedShift };
  if (closedShift) return { state: "CLOSED", shift: closedShift };
  return { state: "UNASSIGNED", shift: null };
}

export function validatePosClosureInput(input, cashAmount) {
  const declaredCashAmount = Number(input?.declaredCashAmount);
  if (!Number.isFinite(declaredCashAmount) || declaredCashAmount < 0) {
    return { ok: false, code: "INVALID_DECLARED_CASH" };
  }
  const difference = Math.round(declaredCashAmount) - Math.round(Number(cashAmount || 0));
  const differenceObservation = String(input?.differenceObservation || "").trim();
  if (difference !== 0 && !differenceObservation) {
    return { ok: false, code: "DIFFERENCE_OBSERVATION_REQUIRED" };
  }
  return { ok: true, declaredCashAmount: Math.round(declaredCashAmount), differenceObservation, difference };
}
