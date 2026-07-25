import test from "node:test";
import assert from "node:assert/strict";
import {
  getDispositivosDemo,
  getDispositivoById,
  filterDispositivosByType,
  filterDispositivosByEstado,
  filterDispositivosByConexion,
  searchDispositivos,
  getResumenEstados,
} from "./dispositivos.mjs";
import { getEstacionamientoById } from "./estacionamientos.mjs";

test("getDispositivosDemo returns a valid demo catalog", () => {
  const data = getDispositivosDemo();

  assert.equal(Array.isArray(data), true);
  assert.ok(data.length >= 3);

  const ids = data.map((item) => item.id);
  const codes = data.map((item) => item.codigo);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(codes).size, codes.length);

  const tiposPermitidos = [
    "Cámara LPR",
    "Barrera",
    "Terminal POS",
    "Impresora",
    "Lector QR",
    "Sensor",
    "Controlador de acceso",
    "Cajero automático",
    "Computador",
    "Dispositivo Android",
  ];
  const estadosPermitidos = ["active", "inactive", "maintenance", "retired"];
  const conexionesPermitidas = ["online", "offline", "warning", "unknown"];

  assert.ok(data.every((item) => tiposPermitidos.includes(item.tipo)));
  assert.ok(data.every((item) => estadosPermitidos.includes(item.estado)));
  assert.ok(data.every((item) => conexionesPermitidas.includes(item.conexion)));
});

test("getDispositivoById resolves a device by id", () => {
  const item = getDispositivoById("d-001");

  assert.ok(item);
  assert.equal(item.codigo, "DEV-001");
});

test("filters and search work for the demo catalog", () => {
  const byType = filterDispositivosByType("Cámara LPR");
  const byState = filterDispositivosByEstado("maintenance");
  const byConnection = filterDispositivosByConexion("warning");
  const bySearch = searchDispositivos("AXIS");
  const summary = getResumenEstados();

  assert.ok(byType.length >= 1);
  assert.ok(byState.length >= 1);
  assert.ok(byConnection.length >= 1);
  assert.ok(bySearch.length >= 1);
  assert.equal(summary.total, getDispositivosDemo().length);
  assert.ok(summary.active >= 0);
});

test("device assignments validate against the parking catalog", () => {
  const device = getDispositivoById("d-002");

  if (device.estacionamientoId) {
    const parking = getEstacionamientoById(device.estacionamientoId);
    assert.ok(parking || device.estacionamientoId === "sin-asignar");
  }
});
