import test from "node:test";
import assert from "node:assert/strict";
import { evaluateContractedCapacity, headerActionForTab, PARKING_DETAIL_TAB_KEYS, parkingDetailTabs, structureCreateHref, structureCreateLabel } from "./parkingDetailView.mjs";
import { hasPermission, PERMISSIONS } from "./auth/permissions.mjs";

const onStreetParking = { code: "AAA", type: "ON_STREET" };
const offStreetParking = { code: "PC-001", type: "OFF_STREET" };

test("orden exacto de las cinco secciones del detalle", () => {
  assert.deepEqual(PARKING_DETAIL_TAB_KEYS, ["resumen", "estructura", "tarifas", "operadores", "infraestructura"]);
  assert.deepEqual(parkingDetailTabs(onStreetParking).map((tab) => tab.key), ["resumen", "estructura", "tarifas", "operadores", "infraestructura"]);
});

test("la etiqueta de la segunda pestaña depende de la modalidad", () => {
  assert.equal(parkingDetailTabs(onStreetParking).find((tab) => tab.key === "estructura").label, "Sectores y Calles");
  assert.equal(parkingDetailTabs(offStreetParking).find((tab) => tab.key === "estructura").label, "Niveles y Zonas");
});

test("Tarifas es accesible como pestaña de primer nivel en ambas modalidades", () => {
  assert.ok(parkingDetailTabs(onStreetParking).some((tab) => tab.key === "tarifas" && tab.label === "Tarifas"));
  assert.ok(parkingDetailTabs(offStreetParking).some((tab) => tab.key === "tarifas" && tab.label === "Tarifas"));
});

test("Crear sector/área/nivel aparece únicamente cuando la pestaña activa es Estructura", () => {
  assert.equal(headerActionForTab("estructura"), "estructura");
  for (const tab of ["resumen", "tarifas", "operadores", "infraestructura"]) assert.notEqual(headerActionForTab(tab), "estructura");
});

test("Nueva tarifa aparece únicamente cuando la pestaña activa es Tarifas", () => {
  assert.equal(headerActionForTab("tarifas"), "tarifas");
  for (const tab of ["resumen", "estructura", "operadores", "infraestructura"]) assert.notEqual(headerActionForTab(tab), "tarifas");
});

test("Operadores e Infraestructura no exponen una acción contextual inventada", () => {
  assert.equal(headerActionForTab("operadores"), null);
  assert.equal(headerActionForTab("infraestructura"), null);
  assert.equal(headerActionForTab("resumen"), null);
});

test("el destino de creación de estructura depende de la modalidad", () => {
  assert.equal(structureCreateHref(onStreetParking), "/estacionamientos/AAA/sectores/nuevo");
  assert.equal(structureCreateLabel(onStreetParking), "Crear área");
  assert.equal(structureCreateHref(offStreetParking), "/estacionamientos/PC-001/niveles/nuevo");
  assert.equal(structureCreateLabel(offStreetParking), "Crear nivel");
});

test("advertencia solo cuando la capacidad operativa supera las plazas contratadas", () => {
  assert.equal(evaluateContractedCapacity(50, 40).overCapacity, true);
  assert.equal(evaluateContractedCapacity(40, 40).overCapacity, false);
  assert.equal(evaluateContractedCapacity(30, 40).overCapacity, false);
});

test("sin plazas contratadas definidas no se muestra advertencia (no se inventa el KPI)", () => {
  assert.equal(evaluateContractedCapacity(999, null).overCapacity, false);
  assert.equal(evaluateContractedCapacity(999, undefined).overCapacity, false);
});

test("operator no tiene permiso para escribir tarifas ni plazas contratadas", () => {
  assert.equal(hasPermission("operator", PERMISSIONS.PARKINGS_READ), true);
  assert.equal(hasPermission("operator", PERMISSIONS.PARKINGS_MANAGE), false);
  assert.equal(hasPermission("operator", PERMISSIONS.PLATFORM_GLOBAL), false);
});

test("company_admin administra tarifas de su empresa pero no plazas contratadas (dato Root)", () => {
  assert.equal(hasPermission("company_admin", PERMISSIONS.PARKINGS_MANAGE), true);
  assert.equal(hasPermission("company_admin", PERMISSIONS.PLATFORM_GLOBAL), false);
});

test("platform_admin mantiene alcance Root completo", () => {
  assert.equal(hasPermission("platform_admin", PERMISSIONS.PARKINGS_MANAGE), true);
  assert.equal(hasPermission("platform_admin", PERMISSIONS.PLATFORM_GLOBAL), true);
});
