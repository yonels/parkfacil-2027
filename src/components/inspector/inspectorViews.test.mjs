import assert from "node:assert/strict";
import test from "node:test";
import { INSPECTOR_VIEW, activeNavView } from "./inspectorViews.mjs";

test("cada vista tiene una clave de enum única", () => {
  const values = Object.values(INSPECTOR_VIEW);
  assert.equal(new Set(values).size, values.length);
});

test("RESULTADO y FISCALIZACION heredan el resaltado de nav de la vista desde la que se llega", () => {
  assert.equal(activeNavView(INSPECTOR_VIEW.RESULTADO), INSPECTOR_VIEW.CONSULTA);
  assert.equal(activeNavView(INSPECTOR_VIEW.FISCALIZACION), INSPECTOR_VIEW.FISCALIZACIONES);
});

test("el resto de las vistas se resaltan a sí mismas", () => {
  for (const view of [INSPECTOR_VIEW.CONSULTA, INSPECTOR_VIEW.FISCALIZACIONES, INSPECTOR_VIEW.HISTORIAL, INSPECTOR_VIEW.MOROSOS, INSPECTOR_VIEW.MAPA, INSPECTOR_VIEW.SYNC, INSPECTOR_VIEW.AJUSTES]) {
    assert.equal(activeNavView(view), view);
  }
});
