import test from "node:test";
import assert from "node:assert/strict";
import {
  getVisitasDemo,
  getVisitaById,
  getVisitaByCodigo,
  searchVisitas,
  searchVisitasByPatente,
  filterVisitasByEstado,
  filterVisitasByTipo,
  filterVisitasByAprobacion,
  filterVisitasByEstacionamiento,
  filterVisitasByAcceso,
  filterVisitasByEmpresaAnfitriona,
  filterVisitasByAnfitrion,
  filterVisitasByMedioIdentificacion,
  filterVisitasConVehiculo,
  filterVisitasByVigencia,
  filterVisitasDelDia,
  getVisitasProgramadas,
  getVisitasEnCurso,
  getVisitasFinalizadas,
  getVisitasVencidas,
  getVisitasProximasAVencer,
  resolveAnfitrion,
  resolveEmpresaAnfitriona,
  resolveEstacionamientos,
  resolveAccesos,
  resolveMovimientosRelacionados,
  resolveAbonadoRelacionado,
  getVehiculo,
  getAcompanantes,
  calcularDuracionAutorizada,
  calcularVigencia,
  calcularMinutosRestantes,
  calcularResumenVisitas,
  getTipoVisitaLabel,
  getEstadoVisitaLabel,
  getEstadoAprobacionLabel,
  getMedioIdentificacionLabel,
  getTipoVehiculoLabel,
  formatDate,
  formatHour,
  formatRangoHorario,
  tiposVisitaPermitidos,
  estadosVisitaPermitidos,
  estadosAprobacionPermitidos,
  mediosIdentificacionPermitidos,
  tiposVehiculoPermitidos,
} from "./visitas.mjs";

const REFERENCE_DATE = "2026-07-25T10:15:00";

test("ids and codes are unique", () => {
  const visitas = getVisitasDemo();
  assert.ok(Array.isArray(visitas));
  assert.equal(new Set(visitas.map((item) => item.id)).size, visitas.length);
  assert.equal(new Set(visitas.map((item) => item.codigo)).size, visitas.length);
});

test("types, states, approval and identification means are valid", () => {
  const visitas = getVisitasDemo();
  assert.ok(visitas.every((item) => tiposVisitaPermitidos.includes(item.tipoVisita)));
  assert.ok(visitas.every((item) => estadosVisitaPermitidos.includes(item.estado)));
  assert.ok(visitas.every((item) => estadosAprobacionPermitidos.includes(item.estadoAprobacion)));
  assert.ok(visitas.every((item) => mediosIdentificacionPermitidos.includes(item.medioIdentificacion)));
  assert.ok(visitas.filter((item) => item.vehicle).every((item) => tiposVehiculoPermitidos.includes(item.vehicle.vehicleType)));
});

test("resolves by id and code", () => {
  assert.ok(getVisitaById("v-001"));
  assert.equal(getVisitaById("v-999"), null);
  assert.ok(getVisitaByCodigo("VIS-2026-002"));
  assert.equal(getVisitaByCodigo("VIS-2026-999"), null);
});

test("search by text and license plate", () => {
  assert.ok(searchVisitas("Elena").length >= 1);
  assert.ok(searchVisitas("Parking Centro").length >= 1);
  assert.ok(searchVisitasByPatente("DEM-202").length >= 1);
});

test("filters by core fields", () => {
  assert.ok(filterVisitasByEstado("completed").length >= 1);
  assert.ok(filterVisitasByTipo("delivery").length >= 1);
  assert.ok(filterVisitasByAprobacion("pending").length >= 1);
  assert.ok(filterVisitasByEstacionamiento("p-001").length >= 1);
  assert.ok(filterVisitasByAcceso("ca-001").length >= 1);
  assert.ok(filterVisitasByEmpresaAnfitriona("e-001").length >= 1);
  assert.ok(filterVisitasByAnfitrion("u-001").length >= 1);
  assert.ok(filterVisitasByMedioIdentificacion("qr_code").length >= 1);
  assert.ok(filterVisitasConVehiculo(true).length >= 1);
  assert.ok(filterVisitasConVehiculo(false).length >= 1);
});

test("day, schedule and lifecycle helpers work", () => {
  assert.equal(filterVisitasDelDia(REFERENCE_DATE).length, 4);
  assert.ok(getVisitasProgramadas(REFERENCE_DATE).length >= 1);
  assert.ok(getVisitasEnCurso(REFERENCE_DATE).length >= 1);
  assert.ok(getVisitasFinalizadas().length >= 1);
  assert.ok(getVisitasVencidas(REFERENCE_DATE).length >= 1);
  assert.ok(getVisitasProximasAVencer(REFERENCE_DATE).length >= 1);
  assert.ok(filterVisitasByVigencia("Futura", REFERENCE_DATE).length >= 1);
});

test("duration, remaining minutes and vigencia calculation are correct", () => {
  const visita = getVisitaById("v-002");
  assert.ok(visita);
  assert.equal(calcularDuracionAutorizada(visita), 135);
  assert.equal(calcularMinutosRestantes(visita, REFERENCE_DATE), 60);
  const vigencia = calcularVigencia(visita, REFERENCE_DATE);
  assert.equal(vigencia.isVigente, true);
  assert.equal(vigencia.isProximaAVencer, true);
});

test("safe resolution for valid and missing relations", () => {
  const valid = getVisitaById("v-003");
  const invalid = getVisitaById("v-005");

  assert.ok(resolveAnfitrion(valid));
  assert.ok(resolveEmpresaAnfitriona(valid));
  assert.ok(resolveEstacionamientos(valid).length >= 1);
  assert.ok(resolveAccesos(valid).length >= 1);
  assert.ok(resolveMovimientosRelacionados(valid).length >= 1);
  assert.ok(resolveAbonadoRelacionado(valid));

  assert.equal(resolveAnfitrion(invalid), null);
  assert.equal(resolveEmpresaAnfitriona(invalid), null);
  assert.deepEqual(resolveEstacionamientos(invalid), []);
  assert.deepEqual(resolveAccesos(invalid), []);
  assert.deepEqual(resolveMovimientosRelacionados(invalid), []);
  assert.equal(resolveAbonadoRelacionado(invalid), null);
});

test("vehicle and companions helpers work", () => {
  assert.ok(getVehiculo(getVisitaById("v-001")));
  assert.equal(getVehiculo(getVisitaById("v-003")), null);
  assert.ok(getAcompanantes(getVisitaById("v-005")).length >= 1);
  assert.equal(getAcompanantes(getVisitaById("v-002")).length, 0);
});

test("summary and labels are readable", () => {
  const resumen = calcularResumenVisitas(REFERENCE_DATE);
  assert.equal(resumen.total, getVisitasDemo().length);
  assert.ok(resumen.enCurso >= 1);
  assert.ok(resumen.reservasPorVencer >= 1);

  assert.equal(getTipoVisitaLabel("business"), "Reunion comercial");
  assert.equal(getEstadoVisitaLabel("pending_approval"), "Pendiente de aprobacion");
  assert.equal(getEstadoAprobacionLabel("not_required"), "No requerida");
  assert.equal(getMedioIdentificacionLabel("temporary_card"), "Tarjeta temporal");
  assert.equal(getTipoVehiculoLabel("truck"), "Camion");
});

test("date and time formatting helpers work", () => {
  const visita = getVisitaById("v-001");
  assert.equal(formatDate("2026-07-25"), "25/07/2026");
  assert.equal(formatDate(null), "No disponible");
  assert.equal(formatHour("10:30"), "10:30");
  assert.equal(formatHour(null), "No disponible");
  assert.equal(formatRangoHorario(visita), "08:00 - 12:00");
});
