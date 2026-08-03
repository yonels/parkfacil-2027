import test from "node:test";
import assert from "node:assert/strict";
import {
  getUsuariosDemo,
  getUsuarioById,
  searchUsuarios,
  filterUsuariosByEstado,
  filterUsuariosByPerfil,
  filterUsuariosByEmpresa,
  filterUsuariosByEstacionamiento,
  isUsuarioConMultiplesEstacionamientos,
  getEmpresaAsociada,
  getEstacionamientosAsociados,
  getResumenUsuarios,
  getPerfilLabel,
} from "./usuarios.mjs";

test("getUsuariosDemo returns a valid demo catalog", () => {
  const data = getUsuariosDemo();

  assert.equal(Array.isArray(data), true);
  assert.ok(data.length >= 3);

  const ids = data.map((item) => item.id);
  const emails = data.map((item) => item.correo);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(emails).size, emails.length);

  const estadosPermitidos = ["active", "inactive", "pending"];
  const perfilesPermitidos = ["platform_admin", "organization_admin", "company_admin", "parking_manager", "operator", "cashier", "auditor", "support", "viewer"];

  assert.ok(data.every((item) => estadosPermitidos.includes(item.estado)));
  assert.ok(data.every((item) => perfilesPermitidos.includes(item.perfilPrincipal)));
});

test("getUsuarioById resolves a user by id", () => {
  const item = getUsuarioById("u-001");

  assert.ok(item);
  assert.equal(item.correo, "maria.perez@parkfacil.cl");
});

test("search and filters work", () => {
  const byText = searchUsuarios("parkfacil");
  const byStatus = filterUsuariosByEstado("active");
  const byProfile = filterUsuariosByPerfil("parking_manager");
  const byCompany = filterUsuariosByEmpresa("e-001");
  const byParking = filterUsuariosByEstacionamiento("p-001");
  const summary = getResumenUsuarios();

  assert.ok(byText.length >= 1);
  assert.ok(byStatus.length >= 1);
  assert.ok(byProfile.length >= 1);
  assert.ok(byCompany.length >= 1);
  assert.ok(byParking.length >= 1);
  assert.equal(summary.total, getUsuariosDemo().length);
});

test("search resolves a user through person, role, company and RUT", () => {
  assert.equal(searchUsuarios("Patricia González")[0]?.id, "u-005");
  assert.equal(searchUsuarios("Administradora de estacionamientos")[0]?.id, "u-005");
  assert.equal(searchUsuarios("Clínica Ramis")[0]?.id, "u-005");
  assert.equal(searchUsuarios("Sociedad Médica Integral")[0]?.id, "u-005");
  assert.equal(searchUsuarios("76.345.890-2")[0]?.id, "u-005");
  assert.equal(searchUsuarios("PF-003")[0]?.id, "u-005");
});

test("profile labels, company resolution, and parking resolution work", () => {
  const usuario = getUsuarioById("u-001");

  assert.equal(getPerfilLabel("parking_manager"), "Administrador de estacionamiento");
  assert.ok(getEmpresaAsociada(usuario));
  assert.ok(getEstacionamientosAsociados(usuario).length >= 1);
  assert.equal(isUsuarioConMultiplesEstacionamientos(usuario), true);
});
