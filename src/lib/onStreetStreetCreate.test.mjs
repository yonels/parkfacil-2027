import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// "Nueva calle" 100% On Street (2026-08-28): el flujo "On Street > Área >
// + Nueva calle" (y también "On Street > Ubicaciones > Calles > + Nueva
// calle") ya no debe terminar en /estacionamientos/.../calles/nueva. Los
// componentes son React con hooks/fetch (no testeables directo bajo
// `node --test`), así que se verifica por fuente -- mismo patrón ya usado
// en onStreetHierarchyFicha.test.mjs / navigationTreeCore.test.mjs.

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

// 1. "+ Nueva calle" desde Área abre ruta On Street.
test("OnStreetAreaDetail: '+ Nueva calle' sigue enlazando a /on-street-qr/calles/nueva (nunca a /estacionamientos/...)", async () => {
  const src = await source("../components/on-street-admin/OnStreetAreaDetail.js");
  assert.match(src, /\/on-street-qr\/calles\/nueva\?parkingId=\$\{encodeURIComponent\(parking\.id\)\}&areaId=\$\{encodeURIComponent\(id\)\}/);
});

test("/on-street-qr/calles/nueva/page.js: ya no redirige a /estacionamientos/.../calles/nueva -- renderiza el formulario dentro de On Street", async () => {
  const src = await source("../app/on-street-qr/calles/nueva/page.js");
  assert.match(src, /OnStreetStreetCreate/);
  assert.doesNotMatch(src, /import OnStreetQuickCreate/, "ya no debe usar el picker directo (ahora vive envuelto en OnStreetStreetCreate)");
  assert.doesNotMatch(src, /href="\/estacionamientos|router\.push\(`\/estacionamientos/, "la página en sí no debe navegar a Off Street");
});

// 2. Empresa/Estacionamiento/Área llegan precargados.
test("OnStreetStreetCreate: con initialParkingId+initialSectorId, arranca directo en el formulario (sin mostrar el picker)", async () => {
  const src = await source("../components/on-street-admin/OnStreetStreetCreate.js");
  assert.match(src, /initialParkingId && initialSectorId \? \{ parkingId: initialParkingId, sectorId: initialSectorId \} : null/);
  assert.match(src, /!selected \? \(/, "sin contexto precargado, muestra el picker (OnStreetQuickCreate reutilizado)");
  assert.match(src, /<OnStreetQuickCreate kind="street" onReady=/);
});

test("OnStreetStreetCreate: Empresa/Estacionamiento/Área se muestran visibles antes del formulario", async () => {
  const src = await source("../components/on-street-admin/OnStreetStreetCreate.js");
  assert.match(src, /parking\.companyName \|\| parking\.operator\?\.tradeName/);
  assert.match(src, /\{parking\.name\}/);
  assert.match(src, /Área.*\{area\.code\} · \{area\.name\}/);
});

// 3/4. Guardar crea la Calle y redirige a /on-street-qr/calles/[id] (nunca a /estacionamientos/...).
test("OnStreetStreetCreate: reutiliza StructureEntityForm(kind='street') -- mismo formulario/validación/endpoint que Off Street, sin duplicar lógica", async () => {
  const src = await source("../components/on-street-admin/OnStreetStreetCreate.js");
  assert.match(src, /import StructureEntityForm from "@\/components\/estacionamientos\/StructureEntityForm"/);
  assert.match(src, /kind="street"\s*\n\s*parking=\{parking\}\s*\n\s*parent=\{area\}\s*\n\s*entity=\{null\}/);
});

test("OnStreetStreetCreate: al guardar, redirige a la ficha On Street de la nueva calle (/on-street-qr/calles/[id]), nunca a /estacionamientos/...", async () => {
  const src = await source("../components/on-street-admin/OnStreetStreetCreate.js");
  assert.match(src, /onSaved=\{\(data\) => router\.push\(`\/on-street-qr\/calles\/\$\{data\.id\}`\)\}/);
  assert.doesNotMatch(src, /router\.push\(`\/estacionamientos/, "no debe redirigir nunca a Off Street");
});

// 5. Cancelar vuelve al contexto On Street correcto según el punto de entrada.
test("OnStreetStreetCreate: cancelar vuelve a la ficha del Área si vino de ahí, o al listado de Calles si no -- nunca a Off Street", async () => {
  const src = await source("../components/on-street-admin/OnStreetStreetCreate.js");
  assert.match(src, /const cancelHref = initialSectorId \? `\/on-street-qr\/areas\/\$\{initialSectorId\}` : "\/on-street-qr\/calles"/);
  assert.match(src, /cancelHref=\{cancelHref\}/);
});

// 6. No aparece navegación Off Street (breadcrumb, AppShell, sin links a /estacionamientos).
test("OnStreetStreetCreate: breadcrumb y estructura pertenecen a On Street, envuelto en AppShell, sin ningún enlace a Off Street", async () => {
  const src = await source("../components/on-street-admin/OnStreetStreetCreate.js");
  assert.match(src, /aria-label="breadcrumb"/);
  assert.match(src, /href="\/on-street-qr"[^>]*>On Street</);
  assert.match(src, /import AppShell from "@\/components\/layout\/AppShell"/);
  assert.doesNotMatch(src, /href="\/estacionamientos/, "ningún enlace propio debe apuntar a Off Street");
});

// 7. Usuario sin permisos no puede crear -- reutiliza el mismo POST ya
// protegido de Off Street (PARKINGS_MANAGE); no se creó ningún endpoint de
// escritura nuevo ni más permisivo para este flujo.
test("Creación de Calle sigue protegida por el mismo endpoint ya autorizado (PARKINGS_MANAGE) -- no se creó un endpoint de escritura nuevo para On Street", async () => {
  const postRoute = await source("../app/api/estacionamientos/[id]/sectores/[sectorId]/calles/route.js");
  assert.match(postRoute, /authorizeParkingRequest\(request, id, PERMISSIONS\.PARKINGS_MANAGE\)/);
  assert.match(postRoute, /export async function POST/);
  // El picker reutilizado (OnStreetQuickCreate) sigue siendo Root-only vía
  // ROOT_ONLY_PREFIXES (/on-street-qr/areas|calles|tramos) -- sin cambios.
  const permissions = await source("../lib/auth/permissions.mjs");
  assert.match(permissions, /"\/on-street-qr\/calles"/);
});

// onReady es retrocompatible: kind="area"/"segment" y kind="street" sin el
// prop siguen exactamente igual que antes.
test("OnStreetQuickCreate: onReady es opcional y solo afecta kind=\"street\" -- Área (sin onReady) conserva su redirect a Off Street sin cambios", async () => {
  const src = await source("../components/on-street-admin/OnStreetQuickCreate.js");
  assert.match(src, /onReady = null/);
  assert.match(src, /if \(kind === "street"\) \{\s*if \(onReady\) \{/);
  assert.match(src, /router\.push\(`\/estacionamientos\/\$\{parkingSeleccionado\.code\}\/sectores\/nuevo`\)/, "kind=\"area\" conserva su redirect original");
});

// Cierre integral del flujo (2026-08-30): kind="segment" dejó de terminar en
// la ficha Off Street de la calle (StructureRoute.js, con el formulario
// viejo de Orden/Código manual) -- ahora va a la ficha NATIVA On Street
// (OnStreetStreetDetail.js), que ya usa el modelo aprobado (Tramo A/B/C,
// código automático, ver OnStreetTramosManager.js). Dos sistemas para lo
// mismo dejaron de existir.
test("OnStreetQuickCreate: kind=\"segment\" termina en la ficha NATIVA On Street de la calle (/on-street-qr/calles/[id]), no en la ficha Off Street", async () => {
  const src = await source("../components/on-street-admin/OnStreetQuickCreate.js");
  assert.match(src, /router\.push\(`\/on-street-qr\/calles\/\$\{streetId\}`\)/);
  assert.doesNotMatch(src, /router\.push\(`\/estacionamientos\/\$\{parkingSeleccionado\.code\}\/sectores\/\$\{sectorId\}\/calles\/\$\{streetId\}`\)/);
});
