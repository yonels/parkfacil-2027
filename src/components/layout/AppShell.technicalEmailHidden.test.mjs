import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ACCESS_USERNAME_TECHNICAL_DOMAIN } from "../../lib/auth/accessUsernameDomain.mjs";
import { shapeContactDisplay } from "../../lib/companyContactDisplayCore.mjs";

// Encargo "corrige el badge del Portal Cliente" (2026-09-10): el shell
// (badge de cuenta, Mi Cuenta, banner de empresa impersonada) nunca debe
// mostrar el email técnico interno. Reutiliza shapeContactDisplay (mismo
// helper ya usado en "Usuarios asociados", companiesRepository.js) -- estos
// tests cubren tanto el comportamiento puro como el cableado real en
// AppShell.js, para que una futura regresión que vuelva a leer
// `context.email` directo se detecte aquí.

test("shapeContactDisplay: cuenta con email técnico -> solo username, sin @dominio", () => {
  const result = shapeContactDisplay({ email: `pfadminkhxwzb@${ACCESS_USERNAME_TECHNICAL_DOMAIN}` });
  assert.equal(result.usuario, "pfadminkhxwzb");
  assert.doesNotMatch(result.usuario, /@/);
  assert.equal(result.correo, "");
});

test("shapeContactDisplay: cuenta con correo real -> el correo se muestra intacto", () => {
  const result = shapeContactDisplay({ email: "admin@clinicaramis.cl" });
  assert.equal(result.correo, "admin@clinicaramis.cl");
});

test("shapeContactDisplay: el dominio técnico nunca aparece en el valor mostrado, para ningún email de entrada plausible", () => {
  const domainPattern = new RegExp(ACCESS_USERNAME_TECHNICAL_DOMAIN.replace(".", "\\."));
  for (const email of [
    `pfadmin7f3k9a@${ACCESS_USERNAME_TECHNICAL_DOMAIN}`,
    `PFOP1A2B3C@${ACCESS_USERNAME_TECHNICAL_DOMAIN.toUpperCase()}`,
    "operador@empresa-real.cl",
    "",
    null,
  ]) {
    const result = shapeContactDisplay({ email });
    assert.doesNotMatch(result.usuario, domainPattern);
    assert.doesNotMatch(result.correo, domainPattern);
  }
});

test("AppShell.js: getUserContext y el banner de empresa pasan el email por resolveDisplayEmail (shapeContactDisplay), nunca context.email crudo", async () => {
  const source = await readFile(new URL("./AppShell.js", import.meta.url), "utf8");
  assert.match(source, /import \{ shapeContactDisplay \} from "@\/lib\/companyContactDisplayCore\.mjs"/, "debe importar el helper ya existente, no reimplementar la detección");
  assert.match(source, /function resolveDisplayEmail\(email\)/);
  assert.match(source, /email:\s*displayEmail/, "getUserContext debe exponer el email ya filtrado, no context.email crudo");
  assert.match(source, /email:\s*resolveDisplayEmail\(context\.email\)/, "el banner de empresa (clientContext) también debe pasar por el filtro");
  // Ninguna asignación de "email:" debe leer context.email directo sin pasar por resolveDisplayEmail.
  assert.doesNotMatch(source, /email:\s*context\.email[,\s]/, "no debe quedar ningún email: context.email sin filtrar");
});

test("Topbar.js y Sidebar.js: solo consumen userContext.email ya filtrado (no reimplementan ni leen otra fuente de email cruda)", async () => {
  const topbar = await readFile(new URL("./Topbar.js", import.meta.url), "utf8");
  const sidebar = await readFile(new URL("./Sidebar.js", import.meta.url), "utf8");
  for (const source of [topbar, sidebar]) {
    assert.doesNotMatch(source, /acceso\.parkfacilapp\.cl/, "el dominio técnico no debe aparecer literal en estos componentes");
  }
});
