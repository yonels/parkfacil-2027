import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as catalogCore from "./catalogCore.mjs";
import { catalogRowFromDb, catalogRowToDb, diffCatalogRow, normalizeCatalog, sanitizeCatalogInput } from "./catalogCore.mjs";

const migracion = readFileSync(new URL("../../../supabase/migrations/20261016170000_released_payment_catalog_monthly_fee.sql", import.meta.url), "utf8");
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

test("edición de Root: solo el importe mensual; cobro único y modalidades periódicas no se habilitan", () => {
  const ok = sanitizeCatalogInput({ items: [{ modality: "monthly_fee", availableInQuotes: true, packagePriceUf: 99 }] });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.rows[0], { modality: "MONTHLY_FEE", availableInQuotes: true, notes: "" }, "un precio enviado se ignora");
  for (const modality of ["ONE_TIME", "MONTHLY"]) assert.ok(sanitizeCatalogInput({ items: [{ modality, availableInQuotes: true }] }).errors.some((error) => /no editable/.test(error)));
  assert.ok(sanitizeCatalogInput({ items: [{ modality: "MONTHLY_FEE" }, { modality: "ANNUAL" }] }).errors.length > 0);
  assert.ok(sanitizeCatalogInput({ items: [] }).errors[0].includes("importe mensual"));
});

test("mapeo DB <-> dominio y diff para auditoría", () => {
  const row = catalogRowFromDb({ modality: "MONTHLY_FEE", period_months: null, billing_unit: "MONTH", unit_quantity: 1, available_in_quotes: false, notes: null });
  assert.deepEqual(Object.keys(row).sort(), ["availableInQuotes", "billingUnit", "legacy", "modality", "notes", "periodMonths", "unitQuantity", "updatedAt", "updatedBy"]);
  assert.equal(row.legacy, false);
  assert.equal(catalogRowFromDb({ modality: "ONE_TIME", billing_unit: "ONE_TIME" }).legacy, true, "cobro único = historial");
  assert.equal(catalogRowFromDb({ modality: "MONTHLY", period_months: 1 }).legacy, true, "modalidad periódica = historial");
  const db = catalogRowToDb({ ...row, availableInQuotes: true }, { updatedBy: "u1", now: new Date("2026-10-05T12:00:00Z") });
  assert.deepEqual([db.available_in_quotes, db.billing_unit, db.period_months], [true, "MONTH", null]);
  assert.deepEqual(diffCatalogRow(row, { ...row, availableInQuotes: true }), ["availableInQuotes"]);
  assert.deepEqual(diffCatalogRow(row, { ...row }), []);
});

test("fee mensual primero; cobro único y modalidades periódicas quedan como historial (SOL-2026-10-05-002)", () => {
  const mensual = readFileSync(new URL("../../../supabase/migrations/20261016170000_released_payment_catalog_monthly_fee.sql", import.meta.url), "utf8");
  assert.deepEqual(catalogCore.RELEASED_PAYMENT_MODALITY_CODES, ["MONTHLY_FEE", "ONE_TIME", "HOURLY", "DAILY", "MONTHLY", "SEMIANNUAL", "ANNUAL"]);
  assert.deepEqual(catalogCore.EDITABLE_MODALITY_CODES, ["MONTHLY_FEE"]);
  assert.equal(catalogCore.RELEASED_PAYMENT_MODALITIES.MONTHLY_FEE.billingUnit, "MONTH");
  assert.equal(catalogCore.RELEASED_PAYMENT_MODALITIES.ONE_TIME.legacy, true);
  assert.deepEqual(normalizeCatalog([{ modality: "ONE_TIME" }, { modality: "MONTHLY_FEE" }]).map((row) => row.modality), ["MONTHLY_FEE", "ONE_TIME"]);
  assert.ok(mensual.includes("values ('MONTHLY_FEE', null, 'MONTH', 1, false, '')"), "nace apagada: Root la habilita");
});
