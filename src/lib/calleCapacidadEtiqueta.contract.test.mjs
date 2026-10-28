// Calles (2026-10-28, pedido del usuario): el campo de capacidad de una calle
// se rotula "Capacidad asignada de autos estacionados"; las zonas conservan "Capacidad".
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("la calle rotula su capacidad como capacidad asignada de autos estacionados", async () => {
  const form = await readFile(new URL("../components/estacionamientos/StructureEntityForm.js", import.meta.url), "utf8");
  assert.match(form, /kind === "street" \? "Capacidad asignada de autos estacionados" : "Capacidad"/);
});
