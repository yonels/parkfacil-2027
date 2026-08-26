import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getPortalFromHost, getRequestPortal, normalizeHost } from "./portal.mjs";

test("determina Portal Cliente únicamente desde el host cliente", () => {
  assert.equal(getPortalFromHost("cliente.parkfacilapp.cl"), "client");
  assert.equal(getPortalFromHost("cliente.localhost:3000"), "client");
});

test("determina Portal Root para root y desarrollo local", () => {
  assert.equal(getPortalFromHost("root.parkfacilapp.cl"), "root");
  assert.equal(getPortalFromHost("localhost:3000"), "root");
  assert.equal(getPortalFromHost("root.localhost:3000"), "root");
  assert.equal(normalizeHost("ROOT.PARKFACILAPP.CL:443"), "root.parkfacilapp.cl");
});

test("matriz completa de hosts locales y de produccion", () => {
  assert.equal(getPortalFromHost("localhost:3000"), "root");
  assert.equal(getPortalFromHost("root.localhost:3000"), "root");
  assert.equal(getPortalFromHost("cliente.localhost:3000"), "client");
  assert.equal(getPortalFromHost("root.parkfacilapp.cl"), "root");
  assert.equal(getPortalFromHost("cliente.parkfacilapp.cl"), "client");
});

test("la pagina de login reutiliza getPortalFromHost y no reimplementa la deteccion de host", () => {
  const loginPagePath = fileURLToPath(new URL("../../app/login/page.js", import.meta.url));
  const source = readFileSync(loginPagePath, "utf8");
  assert.match(source, /from "@\/lib\/auth\/portal\.mjs"/, "debe importar la implementacion canonica de portal.mjs");
  assert.match(source, /getPortalFromHost\(/, "debe invocar getPortalFromHost directamente");
  assert.doesNotMatch(source, /cliente\.parkfacilapp\.cl/, "no debe reimplementar la comparacion de host localmente");
});

test("/pos en un host Preview se resuelve como Terminal sin convertir el host completo", () => {
  const headers = new Headers({ host: "parkfacil-2027-preview.vercel.app" });
  assert.equal(getRequestPortal({ url: "https://parkfacil-2027-preview.vercel.app/pos", headers }), "terminal");
  assert.equal(getRequestPortal({ url: "https://parkfacil-2027-preview.vercel.app/empresas", headers }), "root");
});

test("la cabecera Terminal solo selecciona el contexto reducido para APIs POS", () => {
  const headers = new Headers({ host: "parkfacil-2027-preview.vercel.app", "x-parkfacil-portal": "terminal" });
  assert.equal(getRequestPortal({ url: "https://parkfacil-2027-preview.vercel.app/api/data-entry", headers }), "terminal");
});
