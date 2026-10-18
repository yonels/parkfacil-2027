import assert from "node:assert/strict";
import test from "node:test";
import { authorizationIntervals, coveredSecondsBetween, describeAuthorization, isCoveredAt, parsePlateList, validateAuthorizationInput } from "./authorizationCore.mjs";
import { describeContract, validateMonthlyFeeInput } from "./contractCore.mjs";
import { computeAuthorizationTerms, describeTerms, validateTariffInput } from "./tariffCore.mjs";
import { ENTRY_DECISION, evaluateReleasedEntry, MODULE_STATUS, releasedStayCoverage, resolveModuleStatus } from "./releasedStayCore.mjs";
import { contractEndMs, localParts, parseLocalDateTime, zonedLocalToUtc } from "./zonedTime.mjs";

// Octubre 2026 en Santiago: UTC-3 (horario de verano). 2026-10-05 = lunes.
const local = (value) => new Date(parseLocalDateTime(value)).toISOString();
const contract = {
  id: "c1", version: 1, simultaneousSpots: 2, timeZone: "America/Santiago",
  startsAt: local("2026-10-01T00:00"), endsAt: local("2027-10-01T00:00"),
};
// Cupos simultáneos: los define el cliente (SOL-2026-10-05-002).
const moduleOn = { enabled: true, operationalSpots: 2 };
// Contratación con fee mensual (SOL-2026-10-05-002): sin término ni cupos.
const oneTime = { id: "c2", version: 2, modality: "MONTHLY_FEE", simultaneousSpots: null, timeZone: "America/Santiago", startsAt: local("2026-10-01T00:00"), endsAt: null, monthlyFeeUf: 1.5, totalUf: 1.5 };
// Tarifas del estacionamiento a sus beneficiarios (CLP, IVA incluido).
const tariff = (billingUnit, unitPrice, extra = {}) => ({ id: `t-${billingUnit}`, billingUnit, unitPrice, version: 1, currency: "CLP", vatTreatment: "INCLUDED", vatRate: 0.19, supersededAt: null, ...extra });
const tariffs = [tariff("HOUR", 1500), tariff("DAY", 8000), tariff("MONTH", 30000), tariff("YEAR", 300000)];

test("zona horaria operacional: hora local <-> UTC, incluido el cambio de horario", () => {
  assert.equal(new Date(zonedLocalToUtc({ year: 2026, month: 10, day: 5, hour: 9, minute: 0 })).toISOString(), "2026-10-05T12:00:00.000Z");
  assert.equal(new Date(zonedLocalToUtc({ year: 2026, month: 7, day: 6, hour: 9, minute: 0 })).toISOString(), "2026-07-06T13:00:00.000Z", "invierno UTC-4");
  assert.equal(localParts("2026-10-05T12:00:00Z").weekday, 1, "lunes");
});

test("término calendario: horas exactas; días, meses y años calendario (fin de mes y bisiesto)", () => {
  const start = parseLocalDateTime("2026-10-05T10:00");
  assert.equal(contractEndMs(start, "HOUR", 2) - start, 2 * 3600000, "dos horas exactas");
  assert.equal(new Date(contractEndMs(start, "DAY", 3)).toISOString(), local("2026-10-08T10:00"), "tres días calendario");
  assert.equal(new Date(contractEndMs(parseLocalDateTime("2026-01-31T08:00"), "MONTH", 1)).toISOString(), local("2026-02-28T08:00"), "31-01 + 1 mes = 28-02");
  assert.equal(new Date(contractEndMs(parseLocalDateTime("2028-01-31T08:00"), "MONTH", 1)).toISOString(), local("2028-02-29T08:00"), "año bisiesto: 29-02");
  assert.equal(new Date(contractEndMs(parseLocalDateTime("2026-03-31T08:00"), "MONTH", 3)).toISOString(), local("2026-06-30T08:00"));
  assert.equal(new Date(contractEndMs(parseLocalDateTime("2028-02-29T00:00"), "YEAR", 1)).toISOString(), local("2029-02-28T00:00"), "29-02 + 1 año = 28-02");
  assert.equal(new Date(contractEndMs(parseLocalDateTime("2027-03-15T09:30"), "YEAR", 2)).toISOString(), local("2029-03-15T09:30"), "2 años calendario, no 730 días");
  const dst = parseLocalDateTime("2026-09-05T12:00");
  assert.equal(new Date(contractEndMs(dst, "DAY", 1)).toISOString(), local("2026-09-06T12:00"), "cambio de horario: misma hora local");
  assert.equal(contractEndMs(dst, "DAY", 1) - dst, 23 * 3600000);
});

test("contratación ParkFacil: importe mensual final con plazo de 12, 24 o 36 meses; término calendario; sin cupos", () => {
  const doce = validateMonthlyFeeInput({ monthlyFeeUf: "1,8", baseMonthlyFeeUf: "2", discountNotes: "Comercial 10 %", termMonths: "12", startsAt: "2026-01-31", crmProposalNumber: "P-10", reason: "Propuesta P-10 aceptada" });
  assert.equal(doce.ok, true);
  assert.deepEqual([doce.value.monthlyFeeUf, doce.value.baseMonthlyFeeUf, doce.value.termMonths], [1.8, 2, 12]);
  assert.deepEqual([doce.value.startsAt, doce.value.endsAt], [local("2026-01-31T00:00"), local("2027-01-31T00:00")]);
  assert.equal(validateMonthlyFeeInput({ monthlyFeeUf: "1", termMonths: 24, startsAt: "2028-02-29", reason: "Alta" }).value.endsAt, local("2030-02-28T00:00"), "24 meses calendario desde 29-02");
  assert.equal(validateMonthlyFeeInput({ monthlyFeeUf: "1", termMonths: 36, startsAt: "2026-10-05", reason: "Alta" }).value.endsAt, local("2029-10-05T00:00"));
  assert.equal("simultaneousSpots" in doce.value, false, "sin cupos");
  for (const termMonths of ["", 6, 18, 48]) assert.ok(validateMonthlyFeeInput({ monthlyFeeUf: "1", termMonths, startsAt: "2026-10-05", reason: "Alta" }).errors.some((e) => /12, 24 o 36/.test(e)), String(termMonths));
  assert.ok(validateMonthlyFeeInput({ monthlyFeeUf: "1", termMonths: 12, startsAt: "", reason: "Alta" }).errors.some((e) => /fecha de inicio/.test(e)));
  assert.ok(validateMonthlyFeeInput({ monthlyFeeUf: "", termMonths: 12, startsAt: "2026-10-05", reason: "Alta" }).errors.some((e) => /importe mensual final/.test(e)), "pendiente no es 0");
  assert.ok(validateMonthlyFeeInput({ monthlyFeeUf: "2", baseMonthlyFeeUf: "1", termMonths: 12, startsAt: "2026-10-05", reason: "Alta" }).errors.some((e) => /base no puede ser menor/.test(e)));
  assert.ok(validateMonthlyFeeInput({ monthlyFeeUf: "1", termMonths: 12, startsAt: "2026-10-05", reason: "" }).errors.some((e) => /motivo/.test(e)));
  assert.equal(validateMonthlyFeeInput({ monthlyFeeUf: "0", termMonths: 12, startsAt: "2026-10-05", reason: "Sin costo" }).ok, true, "0 explícito es un importe definido");
  const contrato = { modality: "MONTHLY_FEE", monthlyFeeUf: 1.8, baseMonthlyFeeUf: 2, termMonths: 36, totalUf: 1.8 };
  assert.equal(describeContract(contrato), "Importe mensual final: 1,80 UF + IVA mensual (base 2,00 UF, descuento 0,20 UF) · plazo 36 meses");
});

test("vencimiento contractual: con término el módulo vence aunque siga activo; inicio futuro aún no vigente", () => {
  const plazo = { ...oneTime, termMonths: 12, startsAt: local("2025-10-01T00:00"), endsAt: local("2026-10-01T00:00") };
  assert.equal(resolveModuleStatus({ module: moduleOn, contract: plazo, now: local("2026-10-05T10:00") }), MODULE_STATUS.EXPIRED, "no basta con el estado activo");
  assert.equal(resolveModuleStatus({ module: moduleOn, contract: { ...plazo, startsAt: local("2026-11-01T00:00"), endsAt: local("2027-11-01T00:00") }, now: local("2026-10-05T10:00") }), MODULE_STATUS.NOT_STARTED);
  const auth = { id: "a1", status: "ACTIVE", kind: "CONTINUOUS", validFrom: local("2026-09-30T07:00"), validTo: local("2026-10-06T12:00"), schedule: [], version: 1 };
  const vencida = evaluateReleasedEntry({ module: moduleOn, contract: plazo, authorizations: [auth], now: local("2026-10-05T10:00") });
  assert.equal(vencida.decision, ENTRY_DECISION.MODULE_UNAVAILABLE);
  assert.match(vencida.message, /Contratación vencida/);
});

test("cupos del cliente: el ingreso usa los cupos del estacionamiento, no los de la contratación", () => {
  const auth = { id: "a1", status: "ACTIVE", kind: "CONTINUOUS", validFrom: local("2026-10-05T07:00"), validTo: local("2026-10-05T12:00"), schedule: [], version: 1 };
  const now = local("2026-10-05T08:00");
  assert.equal(evaluateReleasedEntry({ module: { enabled: true, operationalSpots: 1 }, contract: oneTime, authorizations: [auth], openReleasedStays: 1, now }).decision, ENTRY_DECISION.NO_SPOTS);
  assert.equal(evaluateReleasedEntry({ module: { enabled: true, operationalSpots: null }, contract: oneTime, authorizations: [auth], openReleasedStays: 0, now }).decision, ENTRY_DECISION.NO_SPOTS, "sin configurar = sin ingresos con beneficio");
  const ok = evaluateReleasedEntry({ module: { enabled: true, operationalSpots: 3 }, contract: { ...oneTime, simultaneousSpots: 1 }, authorizations: [auth], openReleasedStays: 2, now });
  assert.equal(ok.decision, ENTRY_DECISION.ELIGIBLE, "los cupos de una contratación anterior ya no limitan");
  assert.deepEqual([ok.spots.total, ok.snapshot.operationalSpots, ok.snapshot.contract.modality], [3, 3, "MONTHLY_FEE"]);
});

test("tarifas al beneficiario: hora, día, mes y año en CLP con IVA incluido; total = cantidad × precio", () => {
  assert.equal(validateTariffInput({ billingUnit: "month", unitPrice: "30.000", reason: "Tarifa inicial" }).value.unitPrice, 30000);
  assert.equal(validateTariffInput({ billingUnit: "WEEK", unitPrice: "1000", reason: "x y z" }).ok, false, "sin unidades inventadas");
  assert.equal(validateTariffInput({ billingUnit: "HOUR", unitPrice: "1000,5", reason: "x y z" }).ok, false, "CLP sin decimales");
  const mes = computeAuthorizationTerms({ tariff: tariffs[2], quantity: 3, startsAtMs: parseLocalDateTime("2026-01-31T10:00") });
  assert.equal(mes.ok, true);
  assert.deepEqual([mes.value.totalAmount, mes.value.netAmount, mes.value.taxAmount], [90000, 75630, 14370]);
  assert.equal(mes.value.endsAt, local("2026-04-30T10:00"), "31-01 + 3 meses = 30-04");
  assert.equal(describeTerms(mes.value), "3 meses × $30.000 = $90.000 (IVA incluido: neto $75.630 + IVA $14.370)");
  assert.equal(computeAuthorizationTerms({ tariff: tariffs[3], quantity: 11, startsAtMs: Date.now() }).ok, false, "máximo 10 años");
  assert.equal(computeAuthorizationTerms({ tariff: tariffs[0], quantity: 0, startsAtMs: Date.now() }).ok, false);
});

test("autorización: inicio + tarifa × cantidad define la vigencia y lo acordado (la vigencia sola no basta)", () => {
  const dosHoras = validateAuthorizationInput({ kind: "CONTINUOUS", startsAt: "2026-10-05T10:00", tariffId: "t-HOUR", quantity: 2 }, { contract: oneTime, tariffs });
  assert.equal(dosHoras.ok, true);
  assert.equal(new Date(dosHoras.value.validTo) - new Date(dosHoras.value.validFrom), 2 * 3600000);
  assert.deepEqual([dosHoras.value.terms.totalAmount, dosHoras.value.terms.billingUnit], [3000, "HOUR"]);
  const tresDias = validateAuthorizationInput({ kind: "CONTINUOUS", startsAt: "2026-10-05T08:00", tariffId: "t-DAY", quantity: 3 }, { contract: oneTime, tariffs });
  assert.equal(tresDias.value.validTo, local("2026-10-08T08:00"));
  const sinTarifa = validateAuthorizationInput({ kind: "CONTINUOUS", startsAt: "2026-10-05T08:00", endsAt: "2026-10-08T08:00" }, { contract: oneTime, tariffs });
  assert.ok(sinTarifa.errors.some((e) => /tarifa acordada/.test(e)), "una vigencia sin tarifa no se acepta");
  const reemplazada = validateAuthorizationInput({ kind: "CONTINUOUS", startsAt: "2026-10-05T08:00", tariffId: "t-viejo", quantity: 1 }, { contract: oneTime, tariffs });
  assert.ok(reemplazada.errors.some((e) => /ya no está vigente/.test(e)));
  // Versión periódica anterior con término: la autorización debe caber.
  const fuera = validateAuthorizationInput({ kind: "CONTINUOUS", startsAt: "2027-09-30T10:00", tariffId: "t-DAY", quantity: 2 }, { contract, tariffs });
  assert.ok(fuera.errors.some((e) => /vigencia contratada/.test(e)), "respeta el término de una versión anterior");
  assert.equal(validateAuthorizationInput({ kind: "CONTINUOUS", startsAt: "2030-09-30T10:00", tariffId: "t-YEAR", quantity: 2 }, { contract: oneTime, tariffs }).ok, true, "la contratación con fee mensual no vence");
});

test("modificar sin cambiar tarifa, cantidad ni inicio conserva lo acordado aunque la tarifa cambie", () => {
  const acordada = { validFrom: local("2026-01-31T10:00"), validTo: local("2026-02-28T10:00"), terms: { tariffId: "t-MONTH", tariffVersion: 1, billingUnit: "MONTH", quantity: 1, unitPrice: 30000, totalAmount: 30000, netAmount: 25210, taxAmount: 4790 } };
  const nuevas = [tariff("MONTH", 35000, { id: "t-MONTH-v2", version: 2 })];
  const igual = validateAuthorizationInput({ kind: "CONTINUOUS", startsAt: "2026-01-31T10:00", tariffId: "t-MONTH", quantity: 1, beneficiaryName: "Corregido" }, { contract: oneTime, tariffs: nuevas, current: acordada });
  assert.equal(igual.ok, true);
  assert.deepEqual([igual.value.terms.unitPrice, igual.value.terms.totalAmount, igual.value.validTo], [30000, 30000, acordada.validTo]);
  const otraCantidad = validateAuthorizationInput({ kind: "CONTINUOUS", startsAt: "2026-01-31T10:00", tariffId: "t-MONTH", quantity: 2 }, { contract: oneTime, tariffs: nuevas, current: acordada });
  assert.ok(otraCantidad.errors.some((e) => /ya no está vigente/.test(e)), "un nuevo acuerdo usa la tarifa vigente");
  const renovada = validateAuthorizationInput({ kind: "CONTINUOUS", startsAt: "2026-01-31T10:00", tariffId: "t-MONTH-v2", quantity: 2 }, { contract: oneTime, tariffs: nuevas, current: acordada });
  assert.deepEqual([renovada.value.terms.totalAmount, renovada.value.validTo], [70000, local("2026-03-31T10:00")]);
});

test("autorización recurrente: lunes a viernes 09:00–18:00 dentro del período acordado; franja que cruza medianoche", () => {
  const laboral = validateAuthorizationInput({ kind: "RECURRING", startsAt: "2026-10-05T00:00", tariffId: "t-MONTH", quantity: 1, schedule: [{ days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" }] }, { contract: oneTime, tariffs });
  assert.equal(laboral.ok, true);
  assert.equal(laboral.value.validTo, local("2026-11-05T00:00"), "las franjas no cambian la unidad comercial");
  const auth = { ...laboral.value, status: "ACTIVE" };
  assert.match(describeAuthorization(auth), /Recurrente: Lun, Mar, Mié, Jue, Vie 09:00–18:00/);
  assert.equal(isCoveredAt(auth, local("2026-10-05T10:00")), true, "lunes 10:00");
  assert.equal(isCoveredAt(auth, local("2026-10-10T10:00")), false, "sábado");
  assert.equal(isCoveredAt(auth, local("2026-10-05T19:00")), false, "fuera de la franja");
  // Ingreso 08:00, salida 19:00 del lunes: 9 h cubiertas, 2 h cobrables.
  assert.equal(coveredSecondsBetween([auth], local("2026-10-05T08:00"), local("2026-10-05T19:00")), 9 * 3600);
  // Varias franjas en una estadía larga (lun 17:00 -> mar 10:00): 1 h + 1 h.
  assert.equal(coveredSecondsBetween([auth], local("2026-10-05T17:00"), local("2026-10-06T10:00")), 2 * 3600);

  const nocturna = validateAuthorizationInput({ kind: "RECURRING", startsAt: "2026-10-05T00:00", tariffId: "t-DAY", quantity: 1, schedule: [{ days: [1], start: "22:00", end: "02:00" }] }, { contract: oneTime, tariffs });
  assert.equal(nocturna.ok, true);
  const noche = { ...nocturna.value, status: "ACTIVE" };
  assert.equal(isCoveredAt(noche, local("2026-10-06T01:30")), true, "lunes 22:00 → martes 02:00 (la franja iniciada sigue tras el término)");
  assert.equal(coveredSecondsBetween([noche], local("2026-10-05T21:00"), local("2026-10-06T03:00")), 4 * 3600);
  assert.equal(validateAuthorizationInput({ kind: "RECURRING", startsAt: "2026-10-05T00:00", tariffId: "t-DAY", quantity: 1, schedule: [{ days: [], start: "09:00", end: "09:00" }] }, { tariffs }).ok, false);
});

test("sin doble conteo: autorizaciones superpuestas cubren cada minuto una sola vez", () => {
  const a = { kind: "CONTINUOUS", validFrom: local("2026-10-05T09:00"), validTo: local("2026-10-05T12:00") };
  const b = { kind: "CONTINUOUS", validFrom: local("2026-10-05T11:00"), validTo: local("2026-10-05T13:00") };
  assert.equal(coveredSecondsBetween([a, b], local("2026-10-05T08:00"), local("2026-10-05T14:00")), 4 * 3600);
  assert.deepEqual(authorizationIntervals(a, Date.parse(local("2026-10-05T13:00")), Date.parse(local("2026-10-05T14:00"))), []);
});

test("estado del módulo: desactivado, sin iniciar, vencido o activo", () => {
  assert.equal(resolveModuleStatus({ module: null, contract }), MODULE_STATUS.NOT_CONTRACTED);
  assert.equal(resolveModuleStatus({ module: { enabled: false }, contract, now: local("2026-11-01T10:00") }), MODULE_STATUS.DISABLED);
  assert.equal(resolveModuleStatus({ module: moduleOn, contract, now: local("2026-09-30T10:00") }), MODULE_STATUS.NOT_STARTED);
  assert.equal(resolveModuleStatus({ module: moduleOn, contract, now: local("2027-10-01T00:00") }), MODULE_STATUS.EXPIRED);
  assert.equal(resolveModuleStatus({ module: moduleOn, contract, now: local("2026-11-01T10:00") }), MODULE_STATUS.ACTIVE);
  assert.equal(resolveModuleStatus({ module: moduleOn, contract: oneTime, now: local("2040-01-01T10:00") }), MODULE_STATUS.ACTIVE, "fee mensual: no vence");
  assert.equal(resolveModuleStatus({ module: { enabled: false }, contract: oneTime, now: local("2027-01-01T10:00") }), MODULE_STATUS.DISABLED);
});

test("ingreso: patente liberada solo con módulo activo, autorización vigente y cupo disponible", () => {
  const auth = { id: "a1", status: "ACTIVE", kind: "RECURRING", validFrom: local("2026-10-05T00:00"), validTo: local("2026-10-31T00:00"), schedule: [{ days: [1, 2, 3, 4, 5], start: "08:30", end: "12:30" }], version: 1, terms: { tariffId: "t-MONTH", tariffVersion: 1, billingUnit: "MONTH", quantity: 1, unitPrice: 30000, totalAmount: 30000 } };
  const now = local("2026-10-05T08:00");
  assert.equal(evaluateReleasedEntry({ module: moduleOn, contract, authorizations: [], now }).decision, ENTRY_DECISION.NOT_AUTHORIZED);
  const ok = evaluateReleasedEntry({ module: moduleOn, contract, authorizations: [auth], openReleasedStays: 1, now });
  assert.equal(ok.decision, ENTRY_DECISION.ELIGIBLE);
  assert.equal(ok.snapshot.contract.endsAt, contract.endsAt);
  assert.deepEqual(ok.snapshot.authorizations[0].terms, { billingUnit: "MONTH", quantity: 1, unitPrice: 30000, totalAmount: 30000, tariffVersion: 1 }, "el ingreso guarda lo acordado (trazabilidad)");
  const unico = evaluateReleasedEntry({ module: moduleOn, contract: oneTime, authorizations: [auth], openReleasedStays: 1, now });
  assert.equal(unico.decision, ENTRY_DECISION.ELIGIBLE);
  assert.equal(unico.snapshot.contract.endsAt, null);
  assert.equal(releasedStayCoverage(unico.snapshot, now, local("2026-10-05T12:00")).chargeableSeconds, 1800, "sin límite de contratación: solo las franjas");
  assert.equal(evaluateReleasedEntry({ module: moduleOn, contract, authorizations: [auth], openReleasedStays: 2, now }).decision, ENTRY_DECISION.NO_SPOTS, "cupos = ocupación simultánea");
  const off = evaluateReleasedEntry({ module: { enabled: false }, contract, authorizations: [auth], now });
  assert.equal(off.decision, ENTRY_DECISION.MODULE_UNAVAILABLE);
  assert.match(off.message, /Módulo desactivado/);
  assert.equal(evaluateReleasedEntry({ module: moduleOn, contract, authorizations: [{ ...auth, status: "REVOKED" }], now }).decision, ENTRY_DECISION.NOT_AUTHORIZED);
  assert.equal(evaluateReleasedEntry({ module: moduleOn, contract, authorizations: [auth], now: local("2026-11-02T09:00") }).decision, ENTRY_DECISION.AUTHORIZATION_NOT_CURRENT);

  // Ingreso 08:00 con franja desde 08:30, salida 12:00: se cobran 30 minutos.
  const coverage = releasedStayCoverage(ok.snapshot, now, local("2026-10-05T12:00"));
  assert.deepEqual(coverage, { elapsedSeconds: 4 * 3600, coveredSeconds: 3.5 * 3600, chargeableSeconds: 1800 });
});

test("condiciones congeladas: el vencimiento de la contratación limita la cobertura sin efecto retroactivo", () => {
  const corto = { ...contract, endsAt: local("2026-10-05T10:00") };
  const auth = { id: "a1", status: "ACTIVE", kind: "CONTINUOUS", validFrom: local("2026-10-05T08:00"), validTo: local("2026-10-05T10:00"), schedule: [], version: 1 };
  const decision = evaluateReleasedEntry({ module: moduleOn, contract: corto, authorizations: [auth], now: local("2026-10-05T08:00") });
  const coverage = releasedStayCoverage(decision.snapshot, local("2026-10-05T08:00"), local("2026-10-05T11:00"));
  assert.deepEqual([coverage.coveredSeconds, coverage.chargeableSeconds], [7200, 3600]);
});

test("carga masiva: crea autorizaciones individuales por patente (sin grupos)", () => {
  assert.deepEqual(parsePlateList("abcd12, AB-CD-12\nXYZW-34; bad"), { plates: ["ABCD-12", "XYZW-34"], invalid: ["bad"] });
});
