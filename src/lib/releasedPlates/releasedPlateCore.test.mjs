import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReleasedPlateSnapshot,
  displayReleasedPlate,
  evaluateReleasedPlateEntry,
  importRowToInput,
  normalizePhone,
  normalizeReleasedPlate,
  normalizeRut,
  PLATE_ENTRY_DECISION,
  PLATE_STATUS,
  releasedPlateStatus,
  releasedTicketDetail,
  releasedTicketLabel,
  suggestedEndMs,
  validateReleasedPlateInput,
} from "./releasedPlateCore.mjs";
import { releasedStayCoverage } from "../releasedPayment/releasedStayCore.mjs";

const base = {
  plate: "abcd12", validFrom: "2026-10-28T08:00", validTo: "2026-10-28T11:00", durationQuantity: 3, durationUnit: "HOUR",
  beneficiaryName: "Ana Rojas", beneficiaryRut: "123456785", beneficiaryPhone: "912345678", beneficiaryEmail: "Ana@Correo.cl",
  reason: "Cortesía", modality: "FREE", usageMode: "MULTIPLE",
};

test("patentes AAAA-11 y AA-1111 en formato interno", () => {
  assert.equal(normalizeReleasedPlate("abcd12"), "ABCD-12");
  assert.equal(normalizeReleasedPlate("AB-1234"), "AB12-34");
  assert.equal(displayReleasedPlate("AB12-34"), "AB-1234");
  assert.equal(displayReleasedPlate("ABCD-12"), "ABCD-12");
  assert.equal(normalizeReleasedPlate("XYZ-123"), "");
});

test("RUT con dígito verificador y celular chileno", () => {
  assert.equal(normalizeRut("123456785"), "12.345.678-5");
  assert.equal(normalizeRut("12.345.678-9"), "");
  assert.equal(normalizeRut("16543210k"), "16.543.210-K");
  assert.equal(normalizePhone("912345678"), "+56 9 1234 5678");
  assert.equal(normalizePhone("+56 9 1234 5678"), "+56 9 1234 5678");
  assert.equal(normalizePhone("221234567"), "");
});

test("valida y normaliza el formulario; todos los datos del beneficiario son obligatorios", () => {
  const ok = validateReleasedPlateInput(base);
  assert.equal(ok.ok, true);
  assert.equal(ok.row.license_plate, "ABCD-12");
  assert.equal(ok.row.beneficiary_email, "ana@correo.cl");
  assert.equal(ok.row.valid_from, "2026-10-28T11:00:00.000Z");
  const sinNombre = validateReleasedPlateInput({ ...base, beneficiaryName: "", reason: "" });
  assert.equal(sinNombre.ok, false);
  assert.ok(sinNombre.errors.includes("Ingresa el nombre del beneficiario."));
  assert.ok(sinNombre.errors.includes("Ingresa el motivo o referencia."));
  assert.equal(validateReleasedPlateInput({ ...base, validTo: "2026-10-28T07:00" }).ok, false);
});

test("cobro a tercero exige valor y moneda; máximo de usos ≥ 2", () => {
  const tercero = validateReleasedPlateInput({ ...base, modality: "THIRD_PARTY", thirdPartyName: "Conv SpA", thirdPartyRut: "76.123.456-0", thirdPartyEmail: "f@conv.cl", thirdPartyAmount: "2,5", thirdPartyCurrency: "UF" });
  assert.equal(tercero.ok, true);
  assert.equal(tercero.row.third_party_amount, 2.5);
  assert.equal(validateReleasedPlateInput({ ...base, modality: "THIRD_PARTY", thirdPartyName: "Conv SpA", thirdPartyRut: "76.123.456-0", thirdPartyEmail: "f@conv.cl", thirdPartyCurrency: "UF" }).ok, false);
  assert.equal(validateReleasedPlateInput({ ...base, usageMode: "MAX", maxUses: 1 }).ok, false);
  assert.equal(validateReleasedPlateInput({ ...base, usageMode: "SINGLE" }).row.max_uses, 1);
});

test("término sugerido y rótulo del ticket (máx. 24 caracteres)", () => {
  const start = Date.parse("2026-10-28T11:00:00Z");
  assert.equal(new Date(suggestedEndMs(start, 3, "HOUR")).toISOString(), "2026-10-28T14:00:00.000Z");
  assert.equal(new Date(suggestedEndMs(start, 1, "WEEK_WEEKDAYS")).toISOString(), "2026-11-04T11:00:00.000Z");
  assert.equal(releasedTicketLabel({ durationQuantity: 3, durationUnit: "HOUR" }), "LIBERADO POR 3 HORAS");
  assert.equal(releasedTicketLabel({ durationQuantity: 1, durationUnit: "DAY" }), "LIBERADO POR 1 DÍA");
  assert.equal(releasedTicketLabel({ durationQuantity: 1, durationUnit: "YEAR" }), "LIBERADO POR 1 AÑO");
  for (const n of [1, 12]) assert.ok(releasedTicketLabel({ durationQuantity: n, durationUnit: "WEEK_WEEKDAYS" }).length <= 24);
  assert.equal(releasedTicketLabel({ durationQuantity: null, durationUnit: null }), "PAGO LIBERADO");
  assert.equal(releasedTicketDetail({ validFrom: "2026-10-28T11:00:00Z", validTo: "2026-10-28T14:00:00Z" }), "Entre 28-10-2026 08:00 y 28-10-2026 11:00");
});

const auth = (extra = {}) => ({ id: "a1", status: "ACTIVE", validFrom: "2026-10-28T11:00:00Z", validTo: "2026-10-29T11:00:00Z", weekdaysOnly: false, maxUses: null, usesCount: 0, durationQuantity: 1, durationUnit: "DAY", modality: "FREE", usageMode: "MULTIPLE", ...extra });

test("estado de la autorización", () => {
  const now = Date.parse("2026-10-28T15:00:00Z");
  assert.equal(releasedPlateStatus(auth(), now), PLATE_STATUS.CURRENT);
  assert.equal(releasedPlateStatus(auth({ maxUses: 2, usesCount: 2 }), now), PLATE_STATUS.EXHAUSTED);
  assert.equal(releasedPlateStatus(auth(), Date.parse("2026-10-30T00:00:00Z")), PLATE_STATUS.EXPIRED);
  assert.equal(releasedPlateStatus(auth({ status: "DELETED" }), now), PLATE_STATUS.DELETED);
});

test("decisión de ingreso: módulo, vigencia, usos y lunes a viernes", () => {
  const wednesday = Date.parse("2026-10-28T15:00:00Z");
  assert.equal(evaluateReleasedPlateEntry({ enabled: true, authorizations: [], now: wednesday }).decision, PLATE_ENTRY_DECISION.NOT_AUTHORIZED);
  assert.equal(evaluateReleasedPlateEntry({ enabled: false, authorizations: [auth()], now: wednesday }).decision, PLATE_ENTRY_DECISION.MODULE_UNAVAILABLE);
  assert.equal(evaluateReleasedPlateEntry({ enabled: true, authorizations: [auth({ maxUses: 1, usesCount: 1 })], now: wednesday }).decision, PLATE_ENTRY_DECISION.NO_USES);
  const saturday = Date.parse("2026-10-31T15:00:00Z");
  const weekly = auth({ weekdaysOnly: true, validTo: "2026-11-04T11:00:00Z", durationUnit: "WEEK_WEEKDAYS" });
  assert.equal(evaluateReleasedPlateEntry({ enabled: true, authorizations: [weekly], now: saturday }).decision, PLATE_ENTRY_DECISION.WEEKEND);
  const ok = evaluateReleasedPlateEntry({ enabled: true, authorizations: [auth()], now: wednesday });
  assert.equal(ok.decision, PLATE_ENTRY_DECISION.ELIGIBLE);
  assert.equal(ok.snapshot.ticket.label, "LIBERADO POR 1 DÍA");
});

test("la salida cobra solo el excedente y, en «lunes a viernes», el fin de semana", () => {
  const snapshot = buildReleasedPlateSnapshot(auth({ validTo: "2026-10-28T14:00:00Z" }), { now: Date.parse("2026-10-28T12:00:00Z") });
  const coverage = releasedStayCoverage(snapshot, "2026-10-28T12:00:00Z", "2026-10-28T14:30:00Z");
  assert.equal(coverage.coveredSeconds, 2 * 3600);
  assert.equal(coverage.chargeableSeconds, 30 * 60);
  // Viernes 20:00 → sábado 10:00 (hora de Chile) con autorización solo lunes a viernes.
  const weekly = buildReleasedPlateSnapshot(auth({ weekdaysOnly: true, validFrom: "2026-10-26T03:00:00Z", validTo: "2026-11-09T03:00:00Z" }));
  const weekend = releasedStayCoverage(weekly, "2026-10-30T23:00:00Z", "2026-10-31T13:00:00Z");
  assert.equal(weekend.coveredSeconds, 4 * 3600);
  assert.equal(weekend.chargeableSeconds, 10 * 3600);
});

test("fila de Excel a formulario", () => {
  const input = importRowToInput(["ab-1234", "01-11-2026 08:00", "30-11-2026 20:00", "Juan", "12.345.678-5", "+56 9 1234 5678", "j@c.cl", "Convenio", "maximo", 10]);
  assert.equal(input.validFrom, "2026-11-01T08:00");
  assert.equal(input.usageMode, "MAX");
  const valid = validateReleasedPlateInput(input);
  assert.equal(valid.ok, true);
  assert.equal(valid.row.license_plate, "AB12-34");
});
