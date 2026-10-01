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
  { modality: "MONTHLY", periodMonths: 1, packagePriceUf: 2, includedSpots: 5, additionalSpotPriceUf: 0.25, availableInQuotes: false, notes: "" },
  { modality: "SEMIANNUAL", periodMonths: 6, packagePriceUf: 11, includedSpots: 5, additionalSpotPriceUf: null, availableInQuotes: false, notes: "" },
  { modality: "ANNUAL", periodMonths: 12, packagePriceUf: 20, includedSpots: 5, additionalSpotPriceUf: null, availableInQuotes: false, notes: "" },
];
const byModality = (code) => CATALOGO_PRUEBA.find((row) => row.modality === code);

test("sin precios en código: el módulo no exporta catálogo por defecto y normalizeCatalog nunca completa valores", () => {
  assert.equal("DEFAULT_RELEASED_PAYMENT_CATALOG" in catalogCore, false);
  const source = readFileSync(new URL("./catalogCore.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /packagePriceUf:s*d/, "ningún precio literal en el módulo");
  assert.deepEqual(normalizeCatalog([]), []);
  const soloAnual = normalizeCatalog([byModality("ANNUAL"), byModality("MONTHLY")]);
  assert.deepEqual(soloAnual.map((row) => row.modality), ["MONTHLY", "ANNUAL"], "orden fijo, sin inventar la modalidad ausente");
});

test("la migración siembra los valores INICIALES editables (no los fija el código)", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/20261001090000_released_payment_catalog.sql", import.meta.url), "utf8");
  assert.match(sql, /\('MONTHLY', 1, 2\.00, 5, 0\.25, false\)/);
  assert.match(sql, /\('SEMIANNUAL', 6, 11\.00, 5, null, false\)/);
  assert.match(sql, /\('ANNUAL', 12, 20\.00, 5, null, false\)/);
  assert.match(sql, /enable row level security/);
  assert.doesNotMatch(sql, /create policy/i, "sin políticas: solo service role (API Root)");
});

test("cotización mensual dentro del paquete: precio del paquete, sin prorrateo al contratar menos de 5", () => {
  const three = quoteReleasedPayment(byModality("MONTHLY"), { contractedSpots: 3 });
  assert.equal(three.ok, true);
  assert.equal(three.quote.totalPeriodUf, 2);
  assert.equal(three.quote.contractedSpots, 3, "no se habilitan 5 automáticamente");
  assert.equal(three.quote.additionalSpots, 0);
});

test("cotización mensual con plazas adicionales: 8 plazas = 2 + 3 x 0,25 = 2,75 UF + IVA", () => {
  const result = quoteReleasedPayment(byModality("MONTHLY"), { contractedSpots: 8 });
  assert.equal(result.ok, true);
  assert.equal(result.quote.additionalSpots, 3);
  assert.equal(result.quote.additionalTotalUf, 0.75);
  assert.equal(result.quote.totalPeriodUf, 2.75);
  assert.equal(result.quote.taxNote, "+ IVA");
});

test("semestral/anual con plazas adicionales: BLOQUEADO mientras el precio esté pendiente (nunca derivado del mensual)", () => {
  for (const code of ["SEMIANNUAL", "ANNUAL"]) {
    const result = quoteReleasedPayment(byModality(code), { contractedSpots: 6 });
    assert.equal(result.ok, false, code);
    assert.equal(result.code, "ADDITIONAL_PRICE_PENDING");
    assert.match(result.message, /pendiente de definición/);
  }
  const withinPackage = quoteReleasedPayment(byModality("ANNUAL"), { contractedSpots: 5 });
  assert.equal(withinPackage.ok, true, "hasta las plazas incluidas sí se puede cotizar");
  assert.equal(withinPackage.quote.totalPeriodUf, 20);
});

test("total del período y equivalente mensual informativo, sin mezclar períodos", () => {
  const semester = quoteReleasedPayment(byModality("SEMIANNUAL"), { contractedSpots: 5 }).quote;
  assert.equal(semester.totalPeriodUf, 11);
  assert.equal(semester.periodMonths, 6);
  assert.equal(semester.monthlyEquivalentUf, 1.8333);
  const configured = quoteReleasedPayment({ ...byModality("ANNUAL"), additionalSpotPriceUf: 2.5 }, { contractedSpots: 7 }).quote;
  assert.equal(configured.totalPeriodUf, 25, "una vez configurado por Root, usa su precio");
});

test("plazas inválidas o modalidad inválida -> error, nunca un monto", () => {
  for (const spots of [0, -1, 2.5, "x", undefined, 1001]) {
    assert.equal(quoteReleasedPayment(byModality("MONTHLY"), { contractedSpots: spots }).code, "INVALID_SPOTS");
  }
  assert.equal(quoteReleasedPayment({ modality: "WEEKLY" }, { contractedSpots: 1 }).code, "INVALID_MODALITY");
});

test("edición de Root: valida las tres modalidades, UF con 2 decimales, plazas enteras; vacío = pendiente (no 0)", () => {
  const ok = sanitizeCatalogInput({ items: [
    { modality: "monthly", packagePriceUf: "2", includedSpots: 5, additionalSpotPriceUf: "0,25", availableInQuotes: true },
    { modality: "SEMIANNUAL", packagePriceUf: 11, includedSpots: 5, additionalSpotPriceUf: "" },
    { modality: "ANNUAL", packagePriceUf: 20, includedSpots: 5, additionalSpotPriceUf: null },
  ] });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.rows[0].additionalSpotPriceUf, 0.25);
  assert.equal(ok.rows[1].additionalSpotPriceUf, null);
  assert.equal(ok.rows[0].availableInQuotes, true);

  const bad = sanitizeCatalogInput({ items: [
    { modality: "MONTHLY", packagePriceUf: -1, includedSpots: 0, additionalSpotPriceUf: "0.123" },
    { modality: "MONTHLY", packagePriceUf: 1, includedSpots: 5 },
    { modality: "ANNUAL", packagePriceUf: 1, includedSpots: 5 },
  ] });
  assert.ok(bad.errors.some((error) => /paquete/.test(error)));
  assert.ok(bad.errors.some((error) => /plazas incluidas/.test(error)));
  assert.ok(bad.errors.some((error) => /plaza adicional/.test(error)));
  assert.ok(bad.errors.some((error) => /duplicada/.test(error)));
  assert.deepEqual(sanitizeCatalogInput({ items: [] }).errors, ["Debe informar las tres modalidades (mensual, semestral y anual)."]);
});

test("mapeo DB <-> dominio, normalización y diff para auditoría", () => {
  const row = catalogRowFromDb({ modality: "MONTHLY", period_months: 1, package_price_uf: "2.00", included_spots: 5, additional_spot_price_uf: null, available_in_quotes: false, notes: null });
  assert.equal(row.packagePriceUf, 2);
  assert.equal(row.additionalSpotPriceUf, null);
  const db = catalogRowToDb({ ...row, additionalSpotPriceUf: 0.3 }, { updatedBy: "u1", now: new Date("2026-10-01T12:00:00Z") });
  assert.equal(db.period_months, 1);
  assert.equal(db.additional_spot_price_uf, 0.3);
  assert.equal(db.updated_by, "u1");
  assert.deepEqual(diffCatalogRow(row, { ...row, additionalSpotPriceUf: 0.3 }), ["additionalSpotPriceUf"]);
  assert.deepEqual(diffCatalogRow(row, { ...row }), []);
});
