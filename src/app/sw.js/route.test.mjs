import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// route.js importa "@/lib/frontendVersion" (alias que solo resuelve bajo el
// bundler de Next, no bajo `node --test` plano) -- se prueba por contrato
// sobre el código fuente, mismo criterio que el resto de rutas server-only
// de este repo (ver inspector/manifest.webmanifest/route.test.mjs). El
// template literal que arma el Service Worker es el propio texto fuente que
// se sirve (sin interpolaciones relevantes para estos contratos), así que
// leer el archivo alcanza para verificar las ramas de navegación.
async function readSource() {
  return readFile(new URL("./route.js", import.meta.url), "utf8");
}

test("nunca cachea ni intercepta /api/ ni /auth/ -- ninguna sesión, patente, fiscalización o transacción pasa por el Service Worker", async () => {
  const source = await readSource();
  assert.match(source, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(source, /url\.pathname\.startsWith\("\/auth\/"\)/);
});

test("fallback offline de Inspector es puramente informativo: red primero (no-store), sin caches.put en esa rama", async () => {
  const source = await readSource();
  const match = source.match(/url\.pathname === "\/inspector"[\s\S]*?\n {2}\}/);
  assert.ok(match, "debe existir la rama de navegación /inspector");
  const inspectorBranch = match[0];
  assert.match(inspectorBranch, /cache:\s*"no-store"/);
  assert.match(inspectorBranch, /ParkFacil Inspector sin conexión/);
  assert.doesNotMatch(inspectorBranch, /caches\.(open|put|match)/);
});

test("el fallback de Inspector no toca ni duplica el de POS (rutas y textos separados)", async () => {
  const source = await readSource();
  assert.match(source, /url\.pathname === "\/pos"/);
  assert.match(source, /ParkFacil POS sin conexión/);
  assert.match(source, /url\.pathname === "\/inspector"/);
});

test("el caché de assets versionados (_next/static, /icons) sigue siendo genérico -- Inspector se beneficia sin lógica nueva", async () => {
  const source = await readSource();
  assert.match(source, /isVersionedAsset = url\.pathname\.startsWith\("\/_next\/static\/"\) \|\| url\.pathname\.startsWith\("\/icons\/"\)/);
});
