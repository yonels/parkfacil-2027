export const BILLING_MODES = {
  EFFECTIVE_MINUTE: "EFFECTIVE_MINUTE",
  EXPIRED_BLOCKS: "EXPIRED_BLOCKS",
};

export const LAW_20967_RULES = Object.freeze({
  firstExpiredBlockMinimumSeconds: 1800,
  followingExpiredBlockMinimumSeconds: 600,
  roundingMode: "DOWN",
  lostTicketSurchargeAllowed: false,
});

export function validateOperationalRate(rate) {
  const errors = {};
  if (!Object.values(BILLING_MODES).includes(rate?.billingMode)) errors.billingMode = "Selecciona una modalidad válida.";
  if (rate?.billingMode === BILLING_MODES.EFFECTIVE_MINUTE && !(Number(rate.minuteAmount) > 0)) {
    errors.minuteAmount = "El valor por minuto debe ser mayor que cero.";
  }
  if (rate?.billingMode === BILLING_MODES.EXPIRED_BLOCKS) {
    const blocks = [...(rate.blocks || [])].sort((a, b) => a.sequence - b.sequence);
    if (!blocks.length || blocks[0].sequence !== 1) errors.blocks = "Debes configurar el primer tramo.";
    blocks.forEach((block) => {
      const minimum = block.sequence === 1 ? LAW_20967_RULES.firstExpiredBlockMinimumSeconds : LAW_20967_RULES.followingExpiredBlockMinimumSeconds;
      if (!Number.isInteger(block.durationSeconds) || block.durationSeconds < minimum) {
        errors[`block_${block.sequence}`] = block.sequence === 1
          ? "El primer tramo no puede ser inferior a 30 minutos."
          : "Los tramos siguientes no pueden ser inferiores a 10 minutos.";
      }
    });
  }
  if (!Number.isInteger(Number(rate?.freePeriodSeconds || 0)) || Number(rate.freePeriodSeconds || 0) < 0) {
    errors.freePeriodSeconds = "El período gratuito debe ser igual o mayor que cero.";
  }
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  for (const field of ["regularStartTime", "regularEndTime", "overnightEndTime"]) {
    if (rate?.[field] != null && !timePattern.test(rate[field])) errors[field] = "Ingresa un horario válido.";
  }
  if (rate?.overnightFlatAmount != null && !(Number(rate.overnightFlatAmount) >= 0)) {
    errors.overnightFlatAmount = "El valor nocturno debe ser igual o mayor que cero.";
  }
  return errors;
}

function atTime(date, time, dayOffset = 0) {
  const [hours, minutes] = time.split(":").map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  result.setDate(result.getDate() + dayOffset);
  return result;
}

export function calculateScheduledParkingCharge(rate, entryAt, exitAt) {
  const entry = new Date(entryAt);
  const exit = new Date(exitAt);
  if (!(exit > entry)) return { valid: false, errors: { stay: "La salida debe ser posterior al ingreso." } };
  if (!rate.regularEndTime || !rate.overnightEndTime || rate.overnightFlatAmount == null) {
    return calculateParkingCharge(rate, Math.floor((exit - entry) / 1000));
  }
  let overnightSeconds = 0;
  let overnightPeriods = 0;
  const cursor = new Date(entry); cursor.setHours(0, 0, 0, 0); cursor.setDate(cursor.getDate() - 1);
  const last = new Date(exit); last.setHours(0, 0, 0, 0);
  while (cursor <= last) {
    const nightStart = atTime(cursor, rate.regularEndTime);
    let nightEnd = atTime(cursor, rate.overnightEndTime);
    if (nightEnd <= nightStart) nightEnd = atTime(cursor, rate.overnightEndTime, 1);
    const overlap = Math.max(0, Math.min(exit, nightEnd) - Math.max(entry, nightStart));
    if (overlap > 0) { overnightPeriods += 1; overnightSeconds += Math.floor(overlap / 1000); }
    cursor.setDate(cursor.getDate() + 1);
  }
  const elapsedSeconds = Math.floor((exit - entry) / 1000);
  const regularCharge = calculateParkingCharge(rate, Math.max(0, elapsedSeconds - overnightSeconds));
  if (!regularCharge.valid) return regularCharge;
  const overnightAmount = overnightPeriods * Number(rate.overnightFlatAmount);
  return { ...regularCharge, amount: regularCharge.amount + overnightAmount, elapsedSeconds, overnightSeconds, overnightPeriods, overnightAmount };
}

export function calculateParkingCharge(rate, elapsedSeconds, spacesUsed = 1) {
  const errors = validateOperationalRate(rate);
  if (Object.keys(errors).length) return { valid: false, errors };
  const elapsed = Math.max(0, Math.floor(Number(elapsedSeconds) || 0));
  const spaces = Math.max(1, Math.floor(Number(spacesUsed) || 1));
  const chargeableSeconds = Math.max(0, elapsed - Number(rate.freePeriodSeconds || 0));
  const factor = rate.multiplyBySpaces ? spaces : 1;
  if (elapsed >= 86400 && rate.dailyFlatAmount != null) {
    return { valid: true, requiresDailyPolicy: true, elapsedSeconds: elapsed, chargeableSeconds, spacesUsed: spaces };
  }
  if (rate.billingMode === BILLING_MODES.EFFECTIVE_MINUTE) {
    const raw = chargeableSeconds * Number(rate.minuteAmount) / 60;
    return { valid: true, amount: Math.floor(raw) * factor, elapsedSeconds: elapsed, chargeableSeconds, spacesUsed: spaces, chargedBlocks: [] };
  }
  const blocks = [...rate.blocks].sort((a, b) => a.sequence - b.sequence);
  let remaining = chargeableSeconds;
  let amount = 0;
  const chargedBlocks = [];
  for (const block of blocks) {
    if (remaining < block.durationSeconds) break;
    while (remaining >= block.durationSeconds) {
      remaining -= block.durationSeconds;
      amount += Number(block.amount);
      chargedBlocks.push(block.sequence);
      if (!block.repeatAfter) break;
    }
  }
  return { valid: true, amount: Math.floor(amount) * factor, elapsedSeconds: elapsed, chargeableSeconds, spacesUsed: spaces, chargedBlocks, unchargedSeconds: remaining };
}
