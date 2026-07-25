import test from "node:test";
import assert from "node:assert/strict";
import {
  getEmpresasDemo,
  getEmpresaById,
  searchEmpresas,
  filterEmpresasByEstado,
  filterEmpresasByTipoRelacion,
  filterEmpresasByCiudad,
  getEstacionamientosAsociados,
  getResumenEmpresas,
  formatearRut,
  construirRutCompleto,
  validarRutEstructural,
} from "./empresas.mjs";

test("getEmpresasDemo returns a valid demo catalog", () => {
  const data = getEmpresasDemo();

  assert.equal(Array.isArray(data), true);
  assert.ok(data.length >= 3);

  const ids = data.map((item) => item.id);
  const ruts = data.map((item) => `${item.rutNumero}-${item.rutDv}`);

  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(ruts).size, ruts.length);

  const estadosPermitidos = ["active", "inactive", "onboarding"];
  const tiposPermitidos = ["client", "operator", "administrator", "partner", "supplier"];

  assert.ok(data.every((item) => estadosPermitidos.includes(item.estado)));
  assert.ok(data.every((item) => tiposPermitidos.includes(item.tipoRelacion)));
});

test("getEmpresaById resolves an enterprise by id", () => {
  const item = getEmpresaById("e-001");

  assert.ok(item);
  assert.equal(item.razonSocial, "ParkFacil Operaciones Spa");
});

test("text search and filters work", () => {
  const byText = searchEmpresas("ParkFacil");
  const byState = filterEmpresasByEstado("active");
  const byType = filterEmpresasByTipoRelacion("client");
  const byCity = filterEmpresasByCiudad("Santiago");
  const summary = getResumenEmpresas();

  assert.ok(byText.length >= 1);
  assert.ok(byState.length >= 1);
  assert.ok(byType.length >= 1);
  assert.ok(byCity.length >= 1);
  assert.equal(summary.total, getEmpresasDemo().length);
});

test("RUT helpers format and validate structure", () => {
  assert.equal(formatearRut("49433778"), "4.943.377-8");
  assert.equal(construirRutCompleto("4943377", "8"), "4943377-8");
  assert.equal(validarRutEstructural("4943377", "8"), true);
  assert.equal(validarRutEstructural("123", "0"), false);
});

test("parking associations are resolved correctly", () => {
  const empresa = getEmpresaById("e-001");
  const asociados = getEstacionamientosAsociados(empresa);

  assert.ok(asociados.length >= 1);
  assert.ok(asociados.every((item) => item));
});
