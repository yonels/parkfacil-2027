import test from "node:test";
import assert from "node:assert/strict";
import {
  getAbonadosDemo,
  getAbonadoById,
  searchAbonados,
  searchAbonadosByPatente,
  searchAbonadosByCredencial,
  filterAbonadosByEstado,
  filterAbonadosByTipo,
  filterAbonadosByEmpresa,
  filterAbonadosByEstacionamiento,
  filterAbonadosByTipoCredencial,
  filterAbonadosByVigencia,
  filterAbonadosBloqueados,
  filterAbonadosCredencialesPorVencer,
  resolveEmpresa,
  resolveEstacionamientos,
  resolveResponsable,
  resolveContrato,
  getVehiculos,
  getPatentePrincipal,
  getCredenciales,
  getPermisos,
  isAbonadoVigente,
  getDiasRestantes,
  isAbonadoVencido,
  isCredencialVencida,
  isCredencialProximaAVencer,
  isPermisoVigente,
  getTextoVigencia,
  getResumenAbonados,
  getTipoAbonadoLabel,
  getEstadoAbonadoLabel,
  getTipoCredencialLabel,
  getEstadoCredencialLabel,
  getTipoVehiculoLabel,
  getEstadoVehiculoLabel,
  formatDate,
} from "./abonados.mjs";

test("getAbonadosDemo returns a valid demo catalog", () => {
  const abonados = getAbonadosDemo();
  assert.ok(Array.isArray(abonados));
  assert.ok(abonados.length > 0);
  assert.equal(new Set(abonados.map((item) => item.id)).size, abonados.length);
});

test("types, states and labels are recognized", () => {
  assert.equal(getTipoAbonadoLabel("resident"), "Residente");
  assert.equal(getEstadoAbonadoLabel("suspended"), "Suspendido");
  assert.equal(getTipoCredencialLabel("qr_code"), "Código QR");
  assert.equal(getEstadoCredencialLabel("revoked"), "Revocada");
  assert.equal(getTipoVehiculoLabel("truck"), "Camión");
  assert.equal(getEstadoVehiculoLabel("blocked"), "Bloqueado");
});

test("resolution by id, search and filters work", () => {
  const abonado = getAbonadoById("ab-001");
  assert.ok(abonado);
  assert.ok(searchAbonados("María").length >= 1);
  assert.ok(searchAbonadosByPatente("ABC-123").length >= 1);
  assert.ok(searchAbonadosByCredencial("CRD-1001").length >= 1);
  assert.ok(filterAbonadosByEstado("active").length >= 1);
  assert.ok(filterAbonadosByTipo("resident").length >= 1);
  assert.ok(filterAbonadosByEmpresa("e-001").length >= 1);
  assert.ok(filterAbonadosByEstacionamiento("p-001").length >= 1);
  assert.ok(filterAbonadosByTipoCredencial("rfid_card").length >= 1);
  assert.ok(filterAbonadosByVigencia("vigente").length >= 1);
  assert.ok(filterAbonadosBloqueados().length >= 0);
  assert.ok(filterAbonadosCredencialesPorVencer("2026-08-01").length >= 0);
});

test("derived relationships and summary values behave safely", () => {
  const abonado = getAbonadoById("ab-001");
  assert.ok(resolveEmpresa(abonado));
  assert.ok(resolveEstacionamientos(abonado).length >= 1);
  assert.ok(resolveResponsable(abonado));
  assert.ok(resolveContrato(abonado));
  assert.ok(getVehiculos(abonado).length >= 1);
  assert.ok(getPatentePrincipal(abonado));
  assert.ok(getCredenciales(abonado).length >= 1);
  assert.ok(getPermisos(abonado).length >= 1);
  assert.equal(isAbonadoVigente(abonado, "2026-08-01"), true);
  assert.ok(getDiasRestantes(abonado, "2026-08-01") >= 0);
  assert.equal(isAbonadoVencido(abonado, "2026-08-01"), false);
  assert.equal(isCredencialVencida(abonado.credenciales[0], "2026-08-01"), false);
  assert.equal(isCredencialProximaAVencer(abonado.credenciales[0], "2026-08-01"), false);
  assert.equal(isPermisoVigente(abonado.permisos[0], "2026-08-01"), true);
  assert.equal(getTextoVigencia(abonado, "2026-08-01"), "Vigente");
  const summary = getResumenAbonados("2026-08-01");
  assert.ok(summary.total >= 1);
  assert.ok(summary.vehiculosAutorizados >= 1);
  assert.ok(summary.credencialesVigentes >= 1);
  assert.equal(formatDate("2026-07-24"), "24/07/2026");
});

test("invalid references resolve safely", () => {
  assert.equal(resolveEmpresa({ empresaId: "e-999" }), null);
  assert.deepEqual(resolveEstacionamientos({ estacionamientos: ["p-999"] }), []);
  assert.equal(resolveResponsable({ responsableId: "u-999" }), "No disponible");
  assert.equal(resolveContrato({ contratoId: "c-999" }), null);
});
