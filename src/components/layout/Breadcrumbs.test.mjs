import test from "node:test";
import assert from "node:assert/strict";
import { getParentHref } from "../../lib/navigationParent.mjs";

test("resuelve el padre de páginas principales y detalles", () => {
  assert.equal(getParentHref("/"), null);
  assert.equal(getParentHref("/usuarios"), "/");
  assert.equal(getParentHref("/usuarios/u-005"), "/usuarios");
  assert.equal(getParentHref("/abonados/a-001/editar"), "/abonados/a-001");
});

test("resuelve padres lógicos en la estructura de estacionamientos", () => {
  assert.equal(
    getParentHref("/estacionamientos/PN-002/sectores/area-1/calles/nueva"),
    "/estacionamientos/PN-002/sectores/area-1"
  );
  assert.equal(
    getParentHref("/estacionamientos/PF-001/niveles/nivel-1/zonas/nueva"),
    "/estacionamientos/PF-001/niveles/nivel-1"
  );
  assert.equal(
    getParentHref("/estacionamientos/PN-002/sectores/area-1/calles/calle-1/editar"),
    "/estacionamientos/PN-002/sectores/area-1/calles/calle-1"
  );
});

test("resuelve flujos con un padre funcional especial", () => {
  assert.equal(getParentHref("/turnos/turno-1/cerrar"), "/operacion");
  assert.equal(getParentHref("/cierres-turno/cierre-1"), "/operacion");
  assert.equal(getParentHref("/simulador-tarifas"), "/modelo-dashboard");
});
