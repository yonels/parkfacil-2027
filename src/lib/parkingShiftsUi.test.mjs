import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("edición de turnos existe como endpoint dedicado del estacionamiento", () => {
  const source = read("../app/api/estacionamientos/[id]/turnos/[turnoId]/route.js");
  assert.match(source, /export async function PATCH/);
  assert.match(source, /requireOperationalShift/);
  assert.match(source, /requireParkingChild\(db, context, parking, "operator_assignments", input\.assignmentId\)/);
});

test("edición de turnos bloquea estados cerrados o en cierre", () => {
  const source = read("../app/api/estacionamientos/[id]/turnos/[turnoId]/route.js");
  assert.match(source, /\["CLOSED", "CLOSING"\]\.includes\(currentShift\.status\)/);
  assert.match(source, /SHIFT_NOT_EDITABLE/);
});

test("edición de turnos protege conflicto de turno abierto del operador", () => {
  const source = read("../app/api/estacionamientos/[id]/turnos/[turnoId]/route.js");
  assert.match(source, /from\("operator_shifts"\)\.select\("id,operator_id,status"\)/);
  assert.match(source, /OPERATOR_SHIFT_CONFLICT/);
  assert.match(source, /input\.status === "OPEN"/);
});

test("gestor de turnos permite crear, editar y cerrar desde la misma superficie", () => {
  const source = read("../components/estacionamientos/ParkingShiftsManager.js");
  assert.match(source, /Editar turno/);
  assert.match(source, /Crear turno/);
  assert.match(source, /Cerrar turno/);
  assert.match(source, /method: editingShiftId \? "PATCH" : "POST"/);
});