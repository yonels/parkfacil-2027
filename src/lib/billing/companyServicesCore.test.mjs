import test from "node:test";
import assert from "node:assert/strict";
import { addMonths, contractEndDate, contractNumberFor, itemTypeForCategory, monthlyNetEstimate, suggestedUnitPrice, validateMinimalContract, validateServiceItem } from "./companyServicesCore.mjs";

test("término del contrato = inicio + plazo − 1 día, también a fin de mes", () => {
  assert.equal(contractEndDate("2026-11-01", 12), "2027-10-31");
  assert.equal(contractEndDate("2026-01-31", 1), "2026-02-27");
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
});

test("contrato mínimo: valores por defecto UF y renovación automática", () => {
  const contract = validateMinimalContract({ startsOn: "2026-11-01", durationMonths: "12", paymentDueDays: "6" });
  assert.deepEqual(contract, { startsOn: "2026-11-01", durationMonths: 12, endsOn: "2027-10-31", automaticRenewal: true, paymentDueDays: 6, currency: "UF" });
});

test("contrato mínimo rechaza fecha, plazo o días de pago inválidos", () => {
  assert.throws(() => validateMinimalContract({ startsOn: "2026-02-30", durationMonths: 12, paymentDueDays: 6 }), (e) => e.field === "startsOn");
  assert.throws(() => validateMinimalContract({ startsOn: "2026-11-01", durationMonths: 0, paymentDueDays: 6 }), (e) => e.field === "durationMonths");
  assert.throws(() => validateMinimalContract({ startsOn: "2026-11-01", durationMonths: 12, paymentDueDays: -1 }), (e) => e.field === "paymentDueDays");
});

test("número de contrato usa el RUT y el mes de inicio", () => {
  assert.equal(contractNumberFor({ rutNumber: "77991619", startsOn: "2026-11-01" }), "FACT-77991619-202611");
});

test("tipo de ítem según la categoría del catálogo", () => {
  assert.equal(itemTypeForCategory("DEVICE"), "DEVICE");
  assert.equal(itemTypeForCategory("SUBSCRIPTION"), "FEE");
  assert.equal(itemTypeForCategory("SUPPORT"), "SERVICE");
});

test("precio propuesto solo si la moneda del catálogo coincide con la del contrato", () => {
  assert.equal(suggestedUnitPrice({ referencePrice: 1.5, referenceCurrency: "UF" }, "UF"), 1.5);
  assert.equal(suggestedUnitPrice({ referencePrice: 1.5, referenceCurrency: "UF" }, "CLP"), null);
  assert.equal(suggestedUnitPrice({ referencePrice: null, referenceCurrency: "UF" }, "UF"), null);
});

test("servicio: exige concepto, descripción, cantidad > 0 y fechas coherentes", () => {
  const ok = validateServiceItem({ conceptId: "c1", description: "Parkfacil servicios de software", quantity: "1", unitPrice: "1,5625", validFrom: "2026-11-01", validTo: "" });
  assert.equal(ok.unitPrice, 1.5625);
  assert.equal(ok.validTo, null);
  assert.throws(() => validateServiceItem({ description: "x y", quantity: 1, unitPrice: 1, validFrom: "2026-11-01" }), (e) => e.code === "SERVICE_CONCEPT_REQUIRED");
  assert.throws(() => validateServiceItem({ conceptId: "c1", description: "Servicio", quantity: 0, unitPrice: 1, validFrom: "2026-11-01" }), (e) => e.field === "quantity");
  assert.throws(() => validateServiceItem({ conceptId: "c1", description: "Servicio", quantity: 1, unitPrice: 1, validFrom: "2026-11-01", validTo: "2026-10-01" }), (e) => e.field === "validTo");
});

test("edición parcial de un servicio", () => {
  assert.deepEqual(validateServiceItem({ status: "ENDED" }, { partial: true }), { status: "ENDED" });
  assert.throws(() => validateServiceItem({}, { partial: true }), (e) => e.code === "SERVICE_NO_CHANGES");
});

test("neto mensual estimado considera solo servicios vigentes y resta descuentos", () => {
  const items = [
    { status: "ACTIVE", itemType: "SERVICE", quantity: 1, unitPrice: 1.5, validFrom: "2026-11-01", validTo: null },
    { status: "ACTIVE", itemType: "DISCOUNT", quantity: 1, unitPrice: 0.25, validFrom: "2026-11-01", validTo: null },
    { status: "ENDED", itemType: "SERVICE", quantity: 1, unitPrice: 9, validFrom: "2026-01-01", validTo: null },
    { status: "ACTIVE", itemType: "SERVICE", quantity: 2, unitPrice: 1, validFrom: "2026-12-01", validTo: null },
  ];
  assert.equal(monthlyNetEstimate(items, "2026-11-15"), 1.25);
});
