import test from "node:test";
import assert from "node:assert/strict";
import { buildWizardReturnMarker, resolveWizardReturnHref, WIZARD_RETURN_TTL_MS } from "./wizardReturn.mjs";

const NOW = 1_800_000_000_000;
const marker = buildWizardReturnMarker("/estacionamientos/EMP-1-01/tarifas", "/administracion/configurar-empresa?asistente=nueva", NOW);

test("«Volver» de la pantalla abierta por el asistente regresa al asistente", () => {
  assert.equal(resolveWizardReturnHref(marker, "/estacionamientos/EMP-1-01/tarifas", NOW + 1000), "/administracion/configurar-empresa?asistente=nueva");
  assert.equal(resolveWizardReturnHref(marker, "/estacionamientos/EMP-1-01/tarifas/", NOW + 1000), "/administracion/configurar-empresa?asistente=nueva");
});

test("otras pantallas o páginas internas conservan su «Volver» de siempre", () => {
  assert.equal(resolveWizardReturnHref(marker, "/estacionamientos/EMP-1-01/tarifas/nueva", NOW), null);
  assert.equal(resolveWizardReturnHref(marker, "/estacionamientos/EMP-2-01/tarifas", NOW), null);
  assert.equal(resolveWizardReturnHref(null, "/estacionamientos/EMP-1-01/tarifas", NOW), null);
});

test("la marca vence y solo acepta destinos de «Configurar empresa»", () => {
  assert.equal(resolveWizardReturnHref(marker, "/estacionamientos/EMP-1-01/tarifas", NOW + WIZARD_RETURN_TTL_MS + 1), null);
  assert.equal(resolveWizardReturnHref({ ...marker, returnTo: "https://otro.sitio/" }, "/estacionamientos/EMP-1-01/tarifas", NOW), null);
  assert.equal(resolveWizardReturnHref({ ...marker, returnTo: "/empresas" }, "/estacionamientos/EMP-1-01/tarifas", NOW), null);
});

test("la marca guarda solo la ruta, sin parámetros", () => {
  assert.equal(buildWizardReturnMarker("/estacionamientos/EMP-1-01/niveles?x=1#a", "/administracion/configurar-empresa", NOW).path, "/estacionamientos/EMP-1-01/niveles");
});
