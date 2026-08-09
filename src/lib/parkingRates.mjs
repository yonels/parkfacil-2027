export const BILLING_MODES = {
  EFFECTIVE_MINUTE: "EFFECTIVE_MINUTE",
  EXPIRED_BLOCKS: "EXPIRED_BLOCKS",
};

// Fuente normativa: ver docs/MOTOR-TARIFARIO-LEGAL.md. Para estadias inferiores a 24
// horas solo existen dos modalidades legales, nunca combinadas, y esta bajo prohibicion
// absoluta redondear o aproximar el cobro al alza.
export const LAW_20967_RULES = Object.freeze({
  firstExpiredBlockMinimumSeconds: 1800,
  followingExpiredBlockMinimumSeconds: 600,
  roundingMode: "DOWN",
  lostTicketSurchargeAllowed: false,
});

// Valida la FORMA legal de una tarifa: modalidad exclusiva, minimos de tramos, y que no
// exista un cargo fijo (nocturno) ajeno a las dos modalidades permitidas para <24h. Esta
// es la unica funcion de validacion de dominio: la usan tanto la API (para impedir
// guardar configuraciones ilegales) como la clasificacion de tarifas heredadas
// (classifyRateCompliance), evitando dos lecturas distintas de la misma regla.
export function validateOperationalRate(rate) {
  const errors = {};
  const mode = rate?.billingMode;
  if (!Object.values(BILLING_MODES).includes(mode)) {
    errors.billingMode = "Selecciona una modalidad válida.";
    return errors;
  }

  if (mode === BILLING_MODES.EFFECTIVE_MINUTE) {
    if (!(Number(rate.minuteAmount) > 0)) errors.minuteAmount = "El valor por minuto debe ser mayor que cero.";
    if (Array.isArray(rate.blocks) && rate.blocks.length > 0) errors.blocks = "Minuto efectivo no admite tramos ni bloques.";
  }

  if (mode === BILLING_MODES.EXPIRED_BLOCKS) {
    if (rate.minuteAmount != null) errors.minuteAmount = "Tramo vencido no admite valor por minuto.";
    const blocks = [...(rate.blocks || [])].sort((a, b) => a.sequence - b.sequence);
    if (!blocks.length || blocks[0].sequence !== 1) errors.blocks = "Debes configurar el tramo inicial.";
    // Secuencia valida y contigua: 1 (tramo inicial), 2 (tramo siguiente), ... sin saltos
    // ni duplicados. Rechaza [1,3], [1,4] o cualquier secuencia arbitraria.
    else if (!blocks.every((block, index) => block.sequence === index + 1)) {
      errors.blocks = "Los tramos deben tener una secuencia contigua sin saltos ni duplicados.";
    }
    blocks.forEach((block) => {
      const minimum = block.sequence === 1 ? LAW_20967_RULES.firstExpiredBlockMinimumSeconds : LAW_20967_RULES.followingExpiredBlockMinimumSeconds;
      if (!Number.isInteger(block.durationSeconds) || block.durationSeconds < minimum) {
        errors[`block_${block.sequence}`] = block.sequence === 1
          ? "El tramo inicial no puede ser inferior a 30 minutos."
          : "Los tramos siguientes no pueden ser inferiores a 10 minutos.";
      }
      if (!(Number(block.amount) >= 0)) errors[`block_amount_${block.sequence}`] = "Ingresa un valor válido.";
      // El tramo inicial (sequence 1) nunca puede repetirse: solo el tramo siguiente
      // puede volver a aplicarse mientras queden minutos por cobrar.
      if (block.sequence === 1 && block.repeatAfter === true) {
        errors[`block_repeat_${block.sequence}`] = "El tramo inicial no puede repetirse.";
      }
    });
  }

  if (!Number.isInteger(Number(rate?.freePeriodSeconds || 0)) || Number(rate.freePeriodSeconds || 0) < 0) {
    errors.freePeriodSeconds = "El período gratuito debe ser igual o mayor que cero.";
  }

  // El "valor unico nocturno" (overnight_flat_amount) es un cargo fijo ajeno a minuto
  // efectivo y a tramo vencido: para estadias <24h la normativa solo admite esas dos
  // modalidades, asi que cualquier valor nocturno fijo distinto de cero queda prohibido.
  if (rate?.overnightFlatAmount != null && Number(rate.overnightFlatAmount) > 0) {
    errors.overnightFlatAmount = "No está permitido un valor fijo nocturno para estadías inferiores a 24 horas.";
  }

  return errors;
}

// Clasifica una tarifa (nueva o heredada) segun la misma regla de validacion de dominio.
// No transforma ni reinterpreta nada: una tarifa que no cumple queda REQUIRES_REVIEW,
// nunca se le asume una modalidad ni se le "arregla" el valor silenciosamente.
export function classifyRateCompliance(rate) {
  const errors = validateOperationalRate(rate);
  const reasons = Object.values(errors);
  return { status: reasons.length ? "REQUIRES_REVIEW" : "VALID", reasons };
}

// Punto de entrada por timestamps: unico calculo, para toda estadia inferior a 24 horas,
// segun la modalidad exclusiva de la tarifa (minuto efectivo o tramo vencido). No aplica
// ningun cargo adicional fuera de esas dos modalidades (ver validateOperationalRate).
export function calculateScheduledParkingCharge(rate, entryAt, exitAt) {
  const entry = new Date(entryAt);
  const exit = new Date(exitAt);
  if (!(exit > entry)) return { valid: false, errors: { stay: "La salida debe ser posterior al ingreso." } };
  const elapsedSeconds = Math.floor((exit - entry) / 1000);
  return { ...calculateParkingCharge(rate, elapsedSeconds), elapsedSeconds };
}

// Única fuente de verdad para "cuál es la tarifa vigente" de una lista de tarifas de un
// parking: activa, dentro de su ventana de vigencia, y legalmente válida (VALID). Una
// tarifa REQUIRES_REVIEW nunca puede quedar seleccionada como vigente, aunque su status
// en la base de datos siga marcado ACTIVE. La usan tanto el cobro operacional
// (Data Entry) como el indicador "Tarifa vigente" del detalle de estacionamiento.
export function selectActiveRate(rates = [], now = Date.now()) {
  const reference = now instanceof Date ? now.getTime() : Number(now);
  return rates.find((rate) =>
    rate.status === "ACTIVE" &&
    new Date(rate.validFrom).getTime() <= reference &&
    (!rate.validUntil || new Date(rate.validUntil).getTime() > reference) &&
    classifyRateCompliance(rate).status === "VALID"
  ) || null;
}

// Función central de cálculo: dado el tiempo transcurrido en segundos, determina el
// monto a cobrar. Nunca redondea al alza: el tiempo cobrable se trunca (Math.floor) y el
// monto final también (Math.floor). Para tramo vencido, cuenta exclusivamente tramos
// completamente cumplidos (comparación >=, nunca Math.ceil): un tramo que no ha vencido
// jamás se cobra.
export function calculateParkingCharge(rate, elapsedSeconds, spacesUsed = 1) {
  const errors = validateOperationalRate(rate);
  if (Object.keys(errors).length) return { valid: false, errors };
  const elapsed = Math.max(0, Math.floor(Number(elapsedSeconds) || 0));
  const spaces = Math.max(1, Math.floor(Number(spacesUsed) || 1));
  const chargeableSeconds = Math.max(0, elapsed - Number(rate.freePeriodSeconds || 0));
  const factor = rate.multiplyBySpaces ? spaces : 1;
  if (elapsed >= 86400) {
    // Régimen >=24h: fuera del alcance del motor legal de estadías transitorias, exista o
    // no un dailyFlatAmount configurado. No se inventa una tarifa diaria ni se cobra
    // automáticamente con MINUTE o EXPIRED_BLOCK más allá de las 24 horas; se marca para
    // revisión administrativa de forma uniforme.
    return { valid: true, requiresDailyPolicy: true, elapsedSeconds: elapsed, chargeableSeconds, spacesUsed: spaces };
  }
  if (rate.billingMode === BILLING_MODES.EFFECTIVE_MINUTE) {
    // La tarifa está expresada por minuto. Solo se cobran minutos efectivos completos:
    // una fracción pendiente nunca se convierte ni se prorratea como un minuto adicional.
    // Esto mantiene alineados el tiempo informado y la base del cobro, sin aproximar al alza.
    const chargedMinutes = Math.floor(chargeableSeconds / 60);
    const amount = Math.floor(chargedMinutes * Number(rate.minuteAmount));
    return { valid: true, amount: amount * factor, elapsedSeconds: elapsed, chargeableSeconds, chargedMinutes, spacesUsed: spaces, chargedBlocks: [] };
  }
  const blocks = [...rate.blocks].sort((a, b) => a.sequence - b.sequence);
  let remaining = chargeableSeconds;
  let amount = 0;
  const chargedBlocks = [];
  for (const block of blocks) {
    if (remaining < block.durationSeconds) break; // el tramo no vence: no se cobra
    while (remaining >= block.durationSeconds) {
      remaining -= block.durationSeconds;
      amount += Number(block.amount);
      chargedBlocks.push(block.sequence);
      if (!block.repeatAfter) break;
    }
  }
  return { valid: true, amount: Math.floor(amount) * factor, elapsedSeconds: elapsed, chargeableSeconds, spacesUsed: spaces, chargedBlocks, unchargedSeconds: remaining };
}
