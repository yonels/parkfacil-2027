import test from "node:test";
import assert from "node:assert/strict";
import { getEstacionamientoById, getEstacionamientosDemo } from "./estacionamientos.mjs";

test("getEstacionamientosDemo returns a valid demo catalog", () => {
  const data = getEstacionamientosDemo();

  assert.equal(Array.isArray(data), true);
  assert.equal(data.length >= 3, true);
  assert.ok(data.every((item) => ["Activo", "Inactivo", "Mantenimiento"].includes(item.estado)));
  assert.ok(data.every((item) => item.capacidad > 0));
});

test("getEstacionamientoById resolves a parking by id", () => {
  const item = getEstacionamientoById("p-001");

  assert.ok(item);
  assert.equal(item.codigo, "PC-001");
});
