import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { isProductionPosHost, posTestEnvironmentLabel, POS_TEST_ENVIRONMENT_LABEL } from "./posEnvironment.mjs";

test("producción: parkfacilapp.cl y sus subdominios no muestran la franja", () => {
  for (const host of ["cliente.parkfacilapp.cl", "pos.parkfacilapp.cl", "acceso.parkfacilapp.cl", "root.parkfacilapp.cl", "onstreet.parkfacilapp.cl", "www.parkfacilapp.cl", "parkfacilapp.cl", "CLIENTE.ParkFacilApp.cl", "cliente.parkfacilapp.cl."]) {
    assert.equal(isProductionPosHost(host), true, host);
    assert.equal(posTestEnvironmentLabel(host), null, host);
  }
});

test("prueba: Preview QA de Vercel, localhost y otros hosts muestran la franja", () => {
  for (const host of ["parkfacil-2027-git-release-qr-onstreet-10-pa-rkfacilapp.vercel.app", "parkfacil-2027.vercel.app", "localhost", "127.0.0.1", "10.0.2.2", "", null, undefined]) {
    assert.equal(isProductionPosHost(host), false, String(host));
    assert.equal(posTestEnvironmentLabel(host), POS_TEST_ENVIRONMENT_LABEL, String(host));
  }
});

test("prueba: subdominios con marca de prueba o dominios que solo imitan el nombre", () => {
  for (const host of ["qa.parkfacilapp.cl", "dev.parkfacilapp.cl", "staging.parkfacilapp.cl", "pos-qa.parkfacilapp.cl", "preview.cliente.parkfacilapp.cl", "parkfacilapp.cl.evil.com", "xparkfacilapp.cl"]) {
    assert.equal(isProductionPosHost(host), false, host);
  }
});

test("texto exacto pedido por el usuario", () => {
  assert.equal(POS_TEST_ENVIRONMENT_LABEL, "AMBIENTE DE PRUEBAS (QA) — sin dinero real");
});

test("la franja está en el login del POS, el acceso de operador y el terminal", () => {
  for (const file of ["src/app/pos/login/page.js", "src/app/acceso-operador/page.js", "src/components/pos/PosTerminal.js"]) {
    assert.match(readFileSync(file, "utf8"), /<PosEnvironmentBanner\b/, file);
  }
});
