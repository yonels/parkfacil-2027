import test from "node:test";
import assert from "node:assert/strict";
import {
  getControlAccesosDemo,
  getControlAccesoById,
  searchControlAccesos,
  filterControlAccesosByEstado,
  filterControlAccesosByTipoAcceso,
  filterControlAccesosByModoOperacion,
  filterControlAccesosByEstacionamiento,
  filterControlAccesosByDispositivo,
  filterControlAccesosByOperador,
  filterControlAccesosByEstadoOperacional,
  resolveEstacionamiento,
  resolveDispositivo,
  resolveOperador,
  resolveUltimaOperacion,
  getResumenControlAccesos,
  getIndicadoresControlAccesos,
  getEstadisticasControlAccesos,
  getTipoAccesoLabel,
  getModoOperacionLabel,
  getEstadoControlAccesoLabel,
  getDireccionLabel,
  formatHorario,
  formatCapacidad,
  formatFechaHora,
  tiposAccesoPermitidos,
  modosOperacionPermitidos,
  estadosControlAccesoPermitidos,
} from "./controlAccesos.mjs";

test("getControlAccesosDemo returns valid and unique ids", () => {
  const accesos = getControlAccesosDemo();
  assert.ok(Array.isArray(accesos));
  assert.ok(accesos.length > 0);
  assert.equal(new Set(accesos.map((item) => item.id)).size, accesos.length);
});

test("states, types and modes are within allowed values", () => {
  const accesos = getControlAccesosDemo();
  assert.ok(accesos.every((item) => tiposAccesoPermitidos.includes(item.tipoAcceso)));
  assert.ok(accesos.every((item) => modosOperacionPermitidos.includes(item.modoOperacion)));
  assert.ok(accesos.every((item) => estadosControlAccesoPermitidos.includes(item.estado)));
  assert.equal(getTipoAccesoLabel("entrance"), "Entrada");
  assert.equal(getModoOperacionLabel("mixed"), "Mixto");
  assert.equal(getEstadoControlAccesoLabel("maintenance"), "Mantenimiento");
  assert.equal(getDireccionLabel("both"), "Ingreso y salida");
});

test("id resolution and search work", () => {
  const acceso = getControlAccesoById("ca-001");
  assert.ok(acceso);
  assert.ok(searchControlAccesos("Norte").length >= 1);
  assert.ok(searchControlAccesos("ACC-002").length >= 1);
  assert.ok(searchControlAccesos("Parking Centro").length >= 1);
});

test("filters return expected records", () => {
  assert.ok(filterControlAccesosByEstado("active").length >= 1);
  assert.ok(filterControlAccesosByTipoAcceso("emergency").length >= 1);
  assert.ok(filterControlAccesosByModoOperacion("manual").length >= 1);
  assert.ok(filterControlAccesosByEstacionamiento("p-001").length >= 1);
  assert.ok(filterControlAccesosByDispositivo("d-001").length >= 1);
  assert.ok(filterControlAccesosByOperador("u-004").length >= 1);
  assert.ok(filterControlAccesosByEstadoOperacional("Operativo").length >= 1);
});

test("summary and statistics are calculated", () => {
  const resumen = getResumenControlAccesos();
  const indicadores = getIndicadoresControlAccesos();
  const estadisticas = getEstadisticasControlAccesos();

  assert.equal(resumen.total, getControlAccesosDemo().length);
  assert.ok(resumen.active >= 1);
  assert.ok(indicadores.conIncidencias >= 1);
  assert.ok(estadisticas.capacidadVehicularTotal > 0);
  assert.ok(estadisticas.capacidadPeatonalTotal > 0);
});

test("relations resolve safely for missing references", () => {
  const acceso = getControlAccesoById("ca-005");
  assert.ok(acceso);
  assert.equal(resolveEstacionamiento(acceso), null);
  assert.equal(resolveDispositivo(acceso), null);
  assert.equal(resolveOperador(acceso), null);
  assert.equal(resolveUltimaOperacion(acceso), null);
});

test("formatting helpers return readable values", () => {
  const acceso = getControlAccesoById("ca-001");
  assert.ok(acceso);
  assert.ok(formatHorario(acceso.horario).includes("00:00"));
  assert.ok(formatCapacidad(acceso.capacidad).includes("veh/h"));
  assert.ok(formatFechaHora(acceso.ultimaActividad.fechaHora).includes("/"));
  assert.equal(formatFechaHora("fecha-invalida"), "No disponible");
});
