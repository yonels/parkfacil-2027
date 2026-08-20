import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const routeUrl = new URL(
  "../app/api/auth/recuperar-contrasena/route.js",
  import.meta.url
);
const coreUrl = new URL("./passwordRecoveryCore.mjs", import.meta.url);

test("route.js de recuperación no registra enlaces, tokens ni errores completos", async () => {
  const source = await readFile(routeUrl, "utf8");

  assert.match(source, /const MODO_DIAGNOSTICO = false;/);
  assert.doesNotMatch(source, /Action link:/);
  assert.doesNotMatch(source, /Email OTP:/);
  assert.doesNotMatch(source, /console\.error\(error\)/);
  assert.doesNotMatch(source, /error\?\.stack/);
  assert.match(source, /type: error\?\.name \|\| "Error"/);
  assert.match(source, /code: error\?\.code \|\| "RECOVERY_REQUEST_FAILED"/);
});

test("route.js delega la lógica de negocio en passwordRecoveryCore", async () => {
  const source = await readFile(routeUrl, "utf8");

  assert.match(source, /from "@\/lib\/passwordRecoveryCore\.mjs"/);
  assert.match(source, /await procesarRecuperacionContrasena\(/);
  assert.match(source, /enviarCorreo: enviarCorreoMicrosoft/);
});

test("el core de recuperación conserva generación server-side y envío por Microsoft 365", async () => {
  const source = await readFile(coreUrl, "utf8");

  assert.match(source, /supabase\.auth\.admin\.generateLink/);
  assert.match(source, /type: "recovery"/);
  assert.match(source, /await enviarCorreo\(/);
  assert.match(source, /data\?\.properties\?\.action_link/);
  assert.match(source, /return respuestaGenerica\(\)/);
});

test("el core de recuperación no reporta éxito ante fallas críticas", async () => {
  const source = await readFile(coreUrl, "utf8");

  // Fallas en la búsqueda del usuario, en la generación del enlace y en el
  // envío por Microsoft Graph deben resolver en respuestaError(), nunca en
  // respuestaGenerica() (200).
  assert.match(source, /return respuestaError\(\)/);

  const ocurrencias = source.match(/return respuestaError\(\)/g) || [];
  assert.ok(
    ocurrencias.length >= 3,
    "se esperan al menos 3 puntos de falla crítica controlada (búsqueda, generación, envío)"
  );
});

test("el core de recuperación solo registra el correo de forma anonimizada", async () => {
  const source = await readFile(coreUrl, "utf8");

  assert.match(
    source,
    /diagnosticar\("Correo solicitado", anonimizarEmail\(emailNormalizado\)\)/
  );
  assert.doesNotMatch(source, /diagnosticar\("Correo solicitado", emailNormalizado\)/);
});
