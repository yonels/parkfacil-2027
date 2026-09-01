import assert from "node:assert/strict";
import test from "node:test";
import { inspectorStatusStyle } from "./inspectorStatusStyle.mjs";
import { INSPECTOR_PLATE_STATUS } from "../../lib/inspector/inspectorMocks.mjs";

test("cada estado usa el color aprobado: verde/rojo/naranja/gris", () => {
  assert.match(inspectorStatusStyle(INSPECTOR_PLATE_STATUS.VIGENTE).chip, /emerald/);
  assert.match(inspectorStatusStyle(INSPECTOR_PLATE_STATUS.VENCIDO).chip, /rose/);
  assert.match(inspectorStatusStyle(INSPECTOR_PLATE_STATUS.OBSERVADO).chip, /amber/);
  assert.match(inspectorStatusStyle(INSPECTOR_PLATE_STATUS.SIN_SESION).chip, /slate/);
});

test("un estado desconocido cae en el estilo SIN_SESION, nunca en un color inventado", () => {
  assert.deepEqual(inspectorStatusStyle("ALGO_QUE_NO_EXISTE"), inspectorStatusStyle(INSPECTOR_PLATE_STATUS.SIN_SESION));
});
