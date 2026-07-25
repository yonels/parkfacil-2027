import test from "node:test";
import assert from "node:assert/strict";
import {
  getTarifasDemo,
  getTarifaById,
  searchTarifas,
  filterTarifasByEstado,
  filterTarifasByTipo,
  filterTarifasByMoneda,
  filterTarifasByModalidad,
  hasImplementation,
  isCustomPlan,
  getResumenTarifas,
  getEstadoLabel,
  getTipoLabel,
  getModalidadLabel,
  getMonedaLabel,
  formatCurrency,
  getPlanTotalReferencial,
  resolveContratos,
} from "./tarifas.mjs";

test("getTarifasDemo returns a valid demo catalog", () => {
  const tarifas = getTarifasDemo();
  assert.ok(Array.isArray(tarifas));
  assert.ok(tarifas.length > 0);
  assert.equal(new Set(tarifas.map((tarifa) => tarifa.id)).size, tarifas.length);
  assert.equal(new Set(tarifas.map((tarifa) => tarifa.codigo)).size, tarifas.length);
});

test("states, types, currencies and billing modes are recognized", () => {
  assert.equal(getEstadoLabel("active"), "Activo");
  assert.equal(getTipoLabel("monthly_subscription"), "Suscripción mensual");
  assert.equal(getMonedaLabel("USD"), "USD");
  assert.equal(getModalidadLabel("one_time"), "Pago único");
});

test("resolution by id and text search work", () => {
  const tarifa = getTarifaById("t-001");
  assert.ok(tarifa);
  assert.ok(searchTarifas("ParkFacil").length >= 1);
  assert.ok(searchTarifas("operación").length >= 1);
});

test("filters and summary work", () => {
  assert.ok(filterTarifasByEstado("active").length >= 1);
  assert.ok(filterTarifasByTipo("monthly_subscription").length >= 1);
  assert.ok(filterTarifasByMoneda("CLP").length >= 1);
  assert.ok(filterTarifasByModalidad("monthly").length >= 1);
  assert.ok(hasImplementation(getTarifaById("t-001")));
  assert.ok(isCustomPlan(getTarifaById("t-004")));
  const resumen = getResumenTarifas();
  assert.ok(resumen.total >= 1);
  assert.ok(resumen.active >= 1);
});

test("contract references resolve safely", () => {
  assert.deepEqual(resolveContratos(getTarifaById("t-004")), []);
  assert.ok(resolveContratos(getTarifaById("t-001")).length >= 1);
});

test("currency values and referential totals are formatted", () => {
  assert.equal(formatCurrency(1000000, "CLP"), "$1.000.000");
  assert.equal(formatCurrency(1500, "USD"), "USD 1,500");
  assert.equal(formatCurrency(12.5, "UF"), "UF 12,5");
  assert.equal(getPlanTotalReferencial(getTarifaById("t-001")), 1800000 + 4200 + 1200000);
});
