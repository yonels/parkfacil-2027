import test from "node:test";
import assert from "node:assert/strict";
import { catalogAuditAction, fromCatalogRow, normalizeCatalogCode, parseReferencePrice, toCatalogRow, validateCatalogInput } from "./catalogCore.mjs";

const base = { code: "software", name: "Parkfacil servicios de software", itemKind: "SERVICE", category: "SERVICE", unit: "mes", taxCategory: "TAXABLE", periodicity: "MONTHLY", referenceCurrency: "UF", referencePrice: "1,5" };

test("normaliza el código: mayúsculas, sin tildes ni espacios", () => {
  assert.equal(normalizeCatalogCode(" Servicio de software "), "SERVICIO_DE_SOFTWARE");
  assert.equal(normalizeCatalogCode("Implementación LPR"), "IMPLEMENTACION_LPR");
});

test("valida un servicio completo con precio en UF", () => {
  const value = validateCatalogInput(base);
  assert.equal(value.code, "SOFTWARE");
  assert.equal(value.referencePrice, 1.5);
  assert.equal(value.referenceCurrency, "UF");
  assert.equal(value.taxCategory, "TAXABLE");
});

test("precio acepta coma o punto decimal y miles con punto", () => {
  assert.equal(parseReferencePrice("1.5"), 1.5);
  assert.equal(parseReferencePrice("1.234,56"), 1234.56);
  assert.equal(parseReferencePrice(""), null);
  assert.throws(() => parseReferencePrice("-1"), (e) => e.code === "CATALOG_PRICE_INVALID");
  assert.throws(() => parseReferencePrice("abc"), (e) => e.code === "CATALOG_PRICE_INVALID");
});

test("exige nombre y código válidos", () => {
  assert.throws(() => validateCatalogInput({ ...base, name: " " }), (e) => e.code === "CATALOG_NAME_INVALID" && e.field === "name");
  assert.throws(() => validateCatalogInput({ ...base, code: "x" }), (e) => e.code === "CATALOG_CODE_INVALID");
});

test("rechaza valores fuera de las listas", () => {
  assert.throws(() => validateCatalogInput({ ...base, itemKind: "OTRO" }), (e) => e.code === "CATALOG_KIND_INVALID");
  assert.throws(() => validateCatalogInput({ ...base, periodicity: "WEEKLY" }), (e) => e.code === "CATALOG_PERIODICITY_INVALID");
  assert.throws(() => validateCatalogInput({ ...base, referenceCurrency: "USD" }), (e) => e.code === "CATALOG_CURRENCY_INVALID");
  assert.throws(() => validateCatalogInput({ ...base, taxCategory: "OTRO" }), (e) => e.code === "CATALOG_TAX_INVALID");
});

test("un descuento no puede ser producto", () => {
  assert.throws(() => validateCatalogInput({ ...base, category: "DISCOUNT", itemKind: "PRODUCT" }), (e) => e.code === "CATALOG_KIND_INVALID");
});

test("edición parcial valida solo lo enviado y exige al menos un cambio", () => {
  assert.deepEqual(validateCatalogInput({ status: "INACTIVE" }, { partial: true }), { status: "INACTIVE" });
  assert.throws(() => validateCatalogInput({}, { partial: true }), (e) => e.code === "CATALOG_NO_CHANGES");
});

test("convierte entre la forma de pantalla y las columnas de la tabla", () => {
  const row = toCatalogRow(validateCatalogInput(base), "user-1");
  assert.equal(row.item_kind, "SERVICE");
  assert.equal(row.reference_price, 1.5);
  assert.equal(row.updated_by, "user-1");
  const back = fromCatalogRow({ ...row, id: "c1", reference_price: "1.5000", usage_count: 2 });
  assert.equal(back.referencePrice, 1.5);
  assert.equal(back.usageCount, 2);
});

test("acción de auditoría: creación, activación/desactivación y edición", () => {
  assert.equal(catalogAuditAction(null, { status: "ACTIVE" }), "CREATED");
  assert.equal(catalogAuditAction({ status: "ACTIVE" }, { status: "INACTIVE", updated_by: "u" }), "DEACTIVATED");
  assert.equal(catalogAuditAction({ status: "INACTIVE" }, { status: "ACTIVE", updated_by: "u" }), "ACTIVATED");
  assert.equal(catalogAuditAction({ status: "ACTIVE" }, { name: "Nuevo", status: "ACTIVE", updated_by: "u", unit: "mes" }), "UPDATED");
});
