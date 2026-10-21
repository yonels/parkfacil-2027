import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Wiring RBAC de los endpoints de enrolamiento (encargo "cierre de reenvío
// de enrolamiento" 2026-09-10, §3/§13 C/D). No reimplementa la prueba
// genérica de authorizeApiRequest/requirePlatformAdmin (ya cubierta a fondo
// en la auditoría de acceso) -- solo confirma que AMBOS endpoints nuevos
// están conectados a esa misma capa real, igual que el resto de /api/empresas.
const reenviarUrl = new URL("./reenviar/route.js", import.meta.url);
const estadoUrl = new URL("./route.js", import.meta.url);

test("POST reenviar: exige sesión (authorizeApiRequest) y platform_admin (requirePlatformAdmin) antes de tocar nada", async () => {
  const source = await readFile(reenviarUrl, "utf8");
  assert.match(source, /await authorizeApiRequest\(request\)/);
  assert.match(source, /if \(authorization\.response\) return authorization\.response;/);
  assert.match(source, /requirePlatformAdmin\(authorization\.context\)/);
  // El chequeo de autorización debe ocurrir ANTES de leer params/company.
  const authIndex = source.indexOf("requirePlatformAdmin(authorization.context)");
  const paramsIndex = source.indexOf("const { id } = await params");
  assert.ok(authIndex > 0 && paramsIndex > authIndex, "la autorización debe resolverse antes de leer la empresa");
});

test("POST reenviar: delega la rotación real en companyEnrollmentResendCore (lógica testeable, separada de HTTP)", async () => {
  const source = await readFile(reenviarUrl, "utf8");
  assert.match(source, /resendCompanyEnrollment/);
  assert.match(source, /requestedBy:\s*authorization\.context\.userId/);
  assert.doesNotMatch(source, /createTemporaryPassword/, "la generación de clave vive en el core, no debe reimplementarse en la ruta");
});

test("GET estado: también exige sesión y platform_admin -- el estado de enrolamiento no es de lectura pública", async () => {
  const source = await readFile(estadoUrl, "utf8");
  assert.match(source, /await authorizeApiRequest\(request\)/);
  assert.match(source, /requirePlatformAdmin\(authorization\.context\)/);
});

test("GET estado: no inventa un estado nuevo en BD -- deriva 'reenviado' de la cantidad de intentos ya registrados", async () => {
  const source = await readFile(estadoUrl, "utf8");
  assert.doesNotMatch(source, /check \(estado in/, "no debe declarar un nuevo enum de estado en la ruta");
  assert.match(source, /notifications\.length > 1/);
});
