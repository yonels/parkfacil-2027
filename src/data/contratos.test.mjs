import test from "node:test";
import assert from "node:assert/strict";
import {
  getContratosDemo,
  getContratoById,
  searchContratos,
  filterContratosByEstado,
  filterContratosByTipo,
  filterContratosByEmpresa,
  filterContratosByEstacionamiento,
  filterContratosByMoneda,
  filterContratosByRenovacionAutomatica,
  filterContratosProximosAVencer,
  getResumenContratos,
  getEstadoLabel,
  getTipoLabel,
  getMonedaLabel,
  formatCurrency,
  calcularDuracionMeses,
  calcularVigencia,
  resolveEmpresa,
  resolveEstacionamientos,
  resolveResponsable,
} from "./contratos.mjs";

test("getContratosDemo returns a valid demo catalog", () => {
  const contratos = getContratosDemo();
  assert.ok(Array.isArray(contratos));
  assert.ok(contratos.length > 0);
  assert.equal(new Set(contratos.map((contrato) => contrato.id)).size, contratos.length);
  assert.equal(new Set(contratos.map((contrato) => contrato.numeroContrato)).size, contratos.length);
});

test("states, types and currencies are recognized", () => {
  assert.equal(getEstadoLabel("active"), "Vigente");
  assert.equal(getEstadoLabel("pending_signature"), "Pendiente de firma");
  assert.equal(getTipoLabel("equipment_lease"), "Arriendo de equipamiento");
  assert.equal(getMonedaLabel("USD"), "USD");
});

test("resolution by id and text search work", () => {
  const contrato = getContratoById("c-001");
  assert.ok(contrato);
  assert.ok(searchContratos("ParkFacil").length >= 1);
  assert.ok(searchContratos("maria").length >= 1);
});

test("filters work and summary is calculated", () => {
  assert.ok(filterContratosByEstado("active").length >= 1);
  assert.ok(filterContratosByTipo("software_service").length >= 1);
  assert.ok(filterContratosByEmpresa("e-001").length >= 1);
  assert.ok(filterContratosByEstacionamiento("p-001").length >= 1);
  assert.ok(filterContratosByMoneda("CLP").length >= 1);
  assert.ok(filterContratosByRenovacionAutomatica(true).length >= 1);
  assert.ok(filterContratosProximosAVencer(new Date("2026-01-15")).length >= 0);
  const resumen = getResumenContratos();
  assert.ok(resumen.total >= 1);
  assert.ok(resumen.active >= 1);
});

test("duration and validity helpers work", () => {
  assert.equal(calcularDuracionMeses("2025-01-01", "2026-01-01"), 12);
  const vigencia = calcularVigencia({ startDate: "2025-01-01", endDate: "2026-01-01" }, new Date("2025-06-01"));
  assert.equal(vigencia.isVigente, true);
  assert.equal(vigencia.isProximoAVencer, false);
  assert.equal(vigencia.diasRestantes > 0, true);
});

test("relations resolve safely when missing", () => {
  const contrato = getContratoById("c-004");
  const empresa = resolveEmpresa(contrato);
  const estacionamientos = resolveEstacionamientos(contrato);
  const responsable = resolveResponsable(contrato);
  assert.equal(empresa?.razonSocial ?? "No disponible", "No disponible");
  assert.deepEqual(estacionamientos, []);
  assert.equal(responsable, "No disponible");
});

test("currency values are formatted", () => {
  assert.equal(formatCurrency(1000000, "CLP"), "$1.000.000");
  assert.equal(formatCurrency(1500, "USD"), "USD 1,500");
  assert.equal(formatCurrency(12.5, "UF"), "UF 12,5");
});
