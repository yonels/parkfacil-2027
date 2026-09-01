import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Identidad propia de /inspector/login (corrección 2026-08-31): no puede
// mostrar texto/identidad de POS/Operador, y el login POS no puede mostrar
// identidad de Inspector -- ver src/app/pos/login/page.js para el mismo
// contrato en sentido inverso. Se prueba leyendo el código fuente (mismo
// patrón que inspectorRbac.test.mjs para archivos server/JSX que no se
// renderizan bajo `node --test`) en vez de montar el árbol de React: lo que
// importa aquí es que el texto exista en el JSX servido, no el motor de
// renderizado de React/Next, que ya tiene su propia cobertura en `npm run
// build`.
async function readSource(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("/inspector/login muestra 'ParkFacil Inspector'", async () => {
  const source = await readSource("./page.js");
  assert.match(source, /ParkFacil Inspector/);
});

test("/inspector/login muestra 'ACCESO INSPECTOR'", async () => {
  const source = await readSource("./page.js");
  assert.match(source, /ACCESO INSPECTOR/);
});

test("/inspector/login NO muestra 'ParkFacil POS'", async () => {
  const source = await readSource("./page.js");
  assert.doesNotMatch(source, /ParkFacil POS/);
});

test("/inspector/login NO muestra 'ACCESO OPERADOR' ni 'Acceso Operador'", async () => {
  const source = await readSource("./page.js");
  assert.doesNotMatch(source, /acceso operador/i);
});

test("/inspector/login mantiene el mensaje de exclusividad para inspectores autorizados", async () => {
  const source = await readSource("./page.js");
  assert.match(source, /exclusiva para inspectores autorizados/);
});

test("/inspector/login sigue delegando correo/contraseña/mostrar-ocultar/recuperar/enviar al LoginForm compartido (no duplica el formulario ni el flujo de auth)", async () => {
  const source = await readSource("./page.js");
  assert.match(source, /LoginForm/);
  assert.match(source, /tipoAcceso="inspector"/);
  assert.match(source, /forceInspectorDestination/);
  // El propio formulario (correo/contraseña/mostrar-ocultar/recuperar/
  // Iniciar sesión) vive en LoginForm.js -- no se reimplementa aquí.
});

test("/pos/login mantiene sus textos actuales ('ParkFacil POS', 'Acceso Operador') -- no debe verse afectado por la identidad propia de Inspector", async () => {
  const source = await readSource("../../pos/login/page.js");
  assert.match(source, /ParkFacil POS/);
  assert.match(source, /Acceso Operador/);
  assert.match(source, /exclusiva para operadores POS/);
});
