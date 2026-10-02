import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as catalogCore from "./catalogCore.mjs";
import { catalogRowFromDb, catalogRowToDb, diffCatalogRow, normalizeCatalog, sanitizeCatalogInput } from "./catalogCore.mjs";

const migracion = readFileSync(new URL("../../../supabase/migrations/20261002090000_released_payment_open_price.sql", import.meta.url), "utf8");
const fuente = readFileSync(new URL("./catalogCore.mjs", import.meta.url), "utf8");

test("precio abierto: el catálogo no tiene precios, paquetes, cupos ni fórmula de cálculo", () => {
  assert.equal("quoteReleasedPayment" in catalogCore, false, "no existe cálculo comercial en el catálogo");
  assert.equal("DEFAULT_RELEASED_PAYMENT_CATALOG" in catalogCore, false);
  assert.doesNotMatch(fuente, /packagePriceUf|includedSpots|additionalSpotPriceUf|cupoPriceUf|price_uf/);
  for (const columna of ["package_price_uf", "included_spots", "additional_spot_price_uf"]) {
    assert.match(migracion, new RegExp(`drop column if exists ${columna}`));
  }
});

test("la migración archiva los precios anteriores antes de eliminarlos (registros históricos preservados)", () => {
  const archivo = migracion.indexOf("insert into public.released_payment_catalog_price_archive");
  const borrado = migracion.indexOf("drop column if exists package_price_uf");
  assert.ok(archivo > 0 && archivo < borrado, "primero archiva, después elimina columnas");
  assert.doesNotMatch(migracion, /delete from public\.released_payment_catalog_audit|truncate/i, "la auditoría no se toca");
});

test("solo disponibilidad por modalidad: orden fijo y sin completar modalidades ausentes", () => {
  assert.deepEqual(normalizeCatalog([]), []);
  const filas = [{ modality: "ANNUAL" }, { modality: "MONTHLY" }];
  assert.deepEqual(normalizeCatalog(filas).map((row) => row.modality), ["MONTHLY", "ANNUAL"]);
});

test("edición de Root: disponibilidad y notas; modalidades válidas y sin duplicados", () => {
  const ok = sanitizeCatalogInput({ items: [
    { modality: "monthly", availableInQuotes: true, packagePriceUf: 99 },
    { modality: "SEMIANNUAL" },
    { modality: "ANNUAL", availableInQuotes: false },
  ] });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.rows[0], { modality: "MONTHLY", availableInQuotes: true, notes: "" }, "un precio enviado se ignora");
  const bad = sanitizeCatalogInput({ items: [{ modality: "MONTHLY" }, { modality: "MONTHLY" }, { modality: "WEEKLY" }] });
  assert.ok(bad.errors.some((error) => /duplicada/.test(error)));
  assert.ok(bad.errors.some((error) => /Modalidad inválida/.test(error)));
  assert.deepEqual(sanitizeCatalogInput({ items: [] }).errors, ["Debe informar las tres modalidades (mensual, semestral y anual)."]);
});

test("mapeo DB <-> dominio y diff para auditoría", () => {
  const row = catalogRowFromDb({ modality: "MONTHLY", period_months: 1, available_in_quotes: false, notes: null });
  assert.deepEqual(Object.keys(row).sort(), ["availableInQuotes", "modality", "notes", "periodMonths", "updatedAt", "updatedBy"]);
  const db = catalogRowToDb({ ...row, availableInQuotes: true }, { updatedBy: "u1", now: new Date("2026-10-02T12:00:00Z") });
  assert.equal(db.available_in_quotes, true);
  assert.equal(db.period_months, 1);
  assert.deepEqual(diffCatalogRow(row, { ...row, availableInQuotes: true }), ["availableInQuotes"]);
  assert.deepEqual(diffCatalogRow(row, { ...row }), []);
});
