import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as catalogCore from "./catalogCore.mjs";
import {
  catalogRowFromDb,
  catalogRowToDb,
  diffCatalogRow,
  normalizeCatalog,
  quoteReleasedPayment,
  sanitizeCatalogInput,
} from "./catalogCore.mjs";

// Catálogo de PRUEBA (datos del test, no precios de la aplicación): los
// precios reales viven solo en la base y los edita Root.
const CATALOGO_PRUEBA = [
  { modality: "MONTHLY", periodMonths: 1, cupoPriceUf: 0.4, availableInQuotes: true, notes: "" },
  { modality: "SEMIANNUAL", periodMonths: 6, cupoPriceUf: null, availableInQuotes: false, notes: "" },
  { modality: "ANNUAL", periodMonths: 12, cupoPriceUf: 3.5, availableInQuotes: false, notes: "" },
];
const byModality = (code) => CATALOGO_PRUEBA.find((row) => row.modality === code);
const migracionCupo = readFileSync(new URL("../../../supabase/migrations/20261001110000_released_payment_unit_cupo.sql", import.meta.url), "utf8");

test("sin paquetes: el módulo no tiene precio de paquete, cupos incluidos ni plazas adicionales", () => {
  const source = readFileSync(new URL("./catalogCore.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /packagePriceUf|includedSpots|additionalSpotPriceUf|package_price_uf|included_spots/);
  assert.match(migracionCupo, /drop column if exists package_price_uf/);
  assert.match(migracionCupo, /drop column if exists included_spots/);
  assert.match(migracionCupo, /drop column if exists additional_spot_price_uf/);
});

test("sin precios en código: no hay catálogo por defecto y normalizeCatalog nunca completa valores", () => {
  assert.equal("DEFAULT_RELEASED_PAYMENT_CATALOG" in catalogCore, false);
  assert.deepEqual(normalizeCatalog([]), []);
  const parcial = normalizeCatalog([byModality("ANNUAL"), byModality("MONTHLY")]);
  assert.deepEqual(parcial.map((row) => row.modality), ["MONTHLY", "ANNUAL"], "orden fijo, sin inventar la modalidad ausente");
});

test("la migración no convierte precios de paquete: archiva las filas y deja el precio por cupo pendiente (NULL)", () => {
  assert.match(migracionCupo, /insert into public\.released_payment_catalog_legacy_packages/);
  assert.match(migracionCupo, /add column if not exists cupo_price_uf numeric\(10,2\) null/);
  assert.doesNotMatch(migracionCupo, /cupo_price_uf\s*=\s*[^,;]*package_price_uf/i, "nunca se deriva del paquete");
  assert.match(migracionCupo, /set available_in_quotes = false where cupo_price_uf is null/);
  assert.match(migracionCupo, /check \(not available_in_quotes or cupo_price_uf is not null\)/);
});

test("cotización = cupos × precio por cupo (unitario, sin mínimos ni paquetes)", () => {
  const uno = quoteReleasedPayment(byModality("MONTHLY"), { contractedCupos: 1 });
  assert.equal(uno.ok, true);
  assert.equal(uno.quote.totalPeriodUf, 0.4);
  assert.equal(quoteReleasedPayment(byModality("MONTHLY"), { contractedCupos: 8 }).quote.totalPeriodUf, 3.2);
  const anual = quoteReleasedPayment(byModality("ANNUAL"), { contractedCupos: 3 }).quote;
  assert.equal(anual.totalPeriodUf, 10.5);
  assert.equal(anual.monthlyEquivalentUf, 0.875, "equivalente mensual solo informativo");
  assert.equal(anual.contractedCupos, 3);
});

test("precio pendiente: esa modalidad no se cotiza (nunca se deriva de otra)", () => {
  const result = quoteReleasedPayment(byModality("SEMIANNUAL"), { contractedCupos: 2 });
  assert.equal(result.ok, false);
  assert.equal(result.code, "CUPO_PRICE_PENDING");
  assert.match(result.message, /pendiente de definición/);
});

test("cupos inválidos o modalidad inválida -> error, nunca un monto", () => {
  for (const cupos of [0, -1, 2.5, "x", undefined, 1001]) {
    assert.equal(quoteReleasedPayment(byModality("MONTHLY"), { contractedCupos: cupos }).code, "INVALID_CUPOS");
  }
  assert.equal(quoteReleasedPayment({ modality: "WEEKLY" }, { contractedCupos: 1 }).code, "INVALID_MODALITY");
});

test("edición de Root: precio vacío = pendiente (no 0); sin precio no puede quedar disponible en propuestas", () => {
  const ok = sanitizeCatalogInput({ items: [
    { modality: "monthly", cupoPriceUf: "0,4", availableInQuotes: true },
    { modality: "SEMIANNUAL", cupoPriceUf: "" },
    { modality: "ANNUAL", cupoPriceUf: null },
  ] });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.rows[0].cupoPriceUf, 0.4);
  assert.equal(ok.rows[1].cupoPriceUf, null);

  const bad = sanitizeCatalogInput({ items: [
    { modality: "MONTHLY", cupoPriceUf: "0.123" },
    { modality: "MONTHLY", cupoPriceUf: 1 },
    { modality: "ANNUAL", cupoPriceUf: "", availableInQuotes: true },
  ] });
  assert.ok(bad.errors.some((error) => /precio por cupo/.test(error)));
  assert.ok(bad.errors.some((error) => /duplicada/.test(error)));
  assert.ok(bad.errors.some((error) => /sin precio por cupo definido/.test(error)));
  assert.deepEqual(sanitizeCatalogInput({ items: [] }).errors, ["Debe informar las tres modalidades (mensual, semestral y anual)."]);
});

test("mapeo DB <-> dominio y diff para auditoría", () => {
  const row = catalogRowFromDb({ modality: "MONTHLY", period_months: 1, cupo_price_uf: "0.40", available_in_quotes: false, notes: null });
  assert.equal(row.cupoPriceUf, 0.4);
  assert.equal(catalogRowFromDb({ modality: "ANNUAL", period_months: 12, cupo_price_uf: null }).cupoPriceUf, null);
  const db = catalogRowToDb({ ...row, cupoPriceUf: 0.5 }, { updatedBy: "u1", now: new Date("2026-10-01T12:00:00Z") });
  assert.equal(db.period_months, 1);
  assert.equal(db.cupo_price_uf, 0.5);
  assert.equal(db.updated_by, "u1");
  assert.deepEqual(diffCatalogRow(row, { ...row, cupoPriceUf: 0.5 }), ["cupoPriceUf"]);
  assert.deepEqual(diffCatalogRow(row, { ...row }), []);
});
