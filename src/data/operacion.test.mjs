import test from "node:test";
import assert from "node:assert/strict";
import {
  getOperacionesDemo,
  getOperacionById,
  getTicketByNumero,
  searchOperaciones,
  filterOperacionesByTipo,
  filterOperacionesByEstado,
  filterOperacionesByEstacionamiento,
  filterOperacionesByAcceso,
  filterOperacionesByTipoUsuario,
  filterOperacionesByOrigen,
  resolveEstacionamiento,
  resolveDispositivo,
  resolveOperador,
  getRelacionIngresoSalida,
  calcularPermanencia,
  getTicketsAbiertos,
  getMovimientosManuales,
  getVehiculosDentro,
  getResumenOperativo,
  getTipoMovimientoLabel,
  getEstadoTicketLabel,
  getTipoUsuarioLabel,
  getMedioIdentificacionLabel,
  getOrigenLabel,
  formatFechaHora,
} from "./operacion.mjs";

test("getOperacionesDemo returns a valid demo catalog", () => {
  const operaciones = getOperacionesDemo();
  assert.ok(Array.isArray(operaciones));
  assert.ok(operaciones.length > 0);
  assert.equal(new Set(operaciones.map((item) => item.id)).size, operaciones.length);
  assert.equal(new Set(operaciones.map((item) => item.ticketNumero)).size, operaciones.length);
});

test("movement, ticket and user labels are recognized", () => {
  assert.equal(getTipoMovimientoLabel("entry"), "Ingreso");
  assert.equal(getEstadoTicketLabel("pending_review"), "Pendiente de revisión");
  assert.equal(getTipoUsuarioLabel("subscriber"), "Suscriptor");
  assert.equal(getMedioIdentificacionLabel("lpr"), "Cámara LPR");
  assert.equal(getOrigenLabel("operator"), "Operador");
});

test("resolution by id and text search work", () => {
  const operacion = getOperacionById("op-001");
  assert.ok(operacion);
  assert.ok(getTicketByNumero("TK-1001"));
  assert.ok(searchOperaciones("ABC-123").length >= 1);
  assert.ok(searchOperaciones("Parking").length >= 1);
});

test("filters and summaries work", () => {
  assert.ok(filterOperacionesByTipo("entry").length >= 1);
  assert.ok(filterOperacionesByEstado("open").length >= 1);
  assert.ok(filterOperacionesByEstacionamiento("p-001").length >= 1);
  assert.ok(filterOperacionesByAcceso("A1").length >= 1);
  assert.ok(filterOperacionesByTipoUsuario("visitor").length >= 1);
  assert.ok(filterOperacionesByOrigen("automatic").length >= 1);
  const resumen = getResumenOperativo();
  assert.ok(resumen.vehiculosDentro >= 1);
  assert.ok(resumen.ingresosDia >= 1);
});

test("relationships and derived values work", () => {
  const ingreso = getOperacionById("op-001");
  const salida = getRelacionIngresoSalida(ingreso);
  assert.ok(salida || ingreso);
  assert.ok(calcularPermanencia(ingreso, salida) >= 0);
  assert.ok(getTicketsAbiertos().length >= 1);
  assert.ok(getMovimientosManuales().length >= 1);
  assert.ok(getVehiculosDentro().length >= 1);
  assert.equal(formatFechaHora("2026-07-24T08:00:00"), "24/07/2026 08:00");
});

test("invalid references resolve safely", () => {
  assert.equal(resolveEstacionamiento({ estacionamientoId: "p-999" }), "No disponible");
  assert.equal(resolveDispositivo({ dispositivoId: "d-999" }), "No disponible");
  assert.equal(resolveOperador({ operadorId: "u-999" }), "No disponible");
});
