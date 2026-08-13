import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const routeUrl = new URL("../app/api/auth/recuperar-contrasena/route.js", import.meta.url);

test("recuperación no registra enlaces, OTP, correo ni errores completos", async () => {
  const source = await readFile(routeUrl, "utf8");

  assert.match(source, /const MODO_DIAGNOSTICO = false;/);
  assert.doesNotMatch(source, /Action link:/);
  assert.doesNotMatch(source, /Email OTP:/);
  assert.doesNotMatch(source, /console\.error\(error\)/);
  assert.doesNotMatch(source, /error\?\.stack/);
  assert.match(source, /type: error\?\.name \|\| "Error"/);
  assert.match(source, /code: error\?\.code \|\| "RECOVERY_REQUEST_FAILED"/);
});

test("recuperación conserva generación server-side y envío por Microsoft 365", async () => {
  const source = await readFile(routeUrl, "utf8");

  assert.match(source, /supabase\.auth\.admin\.generateLink/);
  assert.match(source, /type: "recovery"/);
  assert.match(source, /await enviarCorreoMicrosoft/);
  assert.match(source, /data\?\.properties\?\.action_link/);
  assert.match(source, /return respuestaGenerica\(\)/);
});
