import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Auditoría "fichas On Street propias" (2026-08-28): las fichas de
// Área/Calle deben abrirse SIEMPRE bajo /on-street-qr/..., nunca redirigir
// a /estacionamientos/... como experiencia final -- ver OnStreetAreaDetail.js
// / OnStreetStreetDetail.js. Los componentes son React con hooks/fetch (no
// testeables directo bajo `node --test`), así que se verifica por fuente,
// mismo patrón ya usado en navigationTreeCore.test.mjs para Sidebar.js.

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

// 1/2. Click en Área/Calle/Tramo abre ruta On Street -- nunca /estacionamientos/...
test("OnStreetHierarchyWorkspace: fichaHref de Áreas/Calles/Tramos apunta siempre a /on-street-qr, nunca a /estacionamientos", async () => {
  const src = await source("../components/on-street-admin/OnStreetHierarchyWorkspace.js");
  assert.match(src, /fichaHref: \(row\) => `\/on-street-qr\/areas\/\$\{row\.id\}`/, "Área debe abrir /on-street-qr/areas/[id]");
  assert.match(src, /fichaHref: \(row\) => `\/on-street-qr\/calles\/\$\{row\.id\}`/, "Calle debe abrir /on-street-qr/calles/[id]");
  assert.match(src, /fichaHref: \(row\) => \(row\.street\?\.id \? `\/on-street-qr\/calles\/\$\{row\.street\.id\}` : null\)/, "Tramo debe abrir la ficha On Street de su Calle");
  assert.doesNotMatch(src, /fichaHref:[^\n]*\/estacionamientos\//, "ningún fichaHref debe construir una URL /estacionamientos/...");
});

// 3. Breadcrumb pertenece a On Street.
test("OnStreetAreaDetail/OnStreetStreetDetail: breadcrumb propio de On Street, envueltos en AppShell", async () => {
  const area = await source("../components/on-street-admin/OnStreetAreaDetail.js");
  const street = await source("../components/on-street-admin/OnStreetStreetDetail.js");
  for (const src of [area, street]) {
    assert.match(src, /aria-label="breadcrumb"/);
    assert.match(src, /href="\/on-street-qr"[^>]*>On Street</);
    assert.match(src, /import AppShell from "@\/components\/layout\/AppShell"/, "debe usar el mismo AppShell global (mantiene la navegación activa en On Street)");
    assert.doesNotMatch(src, /href="\/estacionamientos/, "el breadcrumb/navegación propia no debe enlazar a Off Street");
  }
});

// 4. Empresa/Estacionamiento/Área correctos -- campos mostrados en la ficha.
test("OnStreetAreaDetail: muestra Empresa/Estacionamiento/Nombre/Código/Estado/fechas usando datos reales (parking.companyName, no un placeholder inventado)", async () => {
  const src = await source("../components/on-street-admin/OnStreetAreaDetail.js");
  for (const campo of ["Empresa", "Estacionamiento", "Nombre del Área", "Código", "Estado", "Creación", "Última actualización"]) {
    assert.match(src, new RegExp(`label="${campo}"`), `falta el campo "${campo}"`);
  }
  assert.match(src, /parking\.companyName/);
});

test("OnStreetStreetDetail: muestra Empresa/Estacionamiento/Área/Calle/Estado/fechas", async () => {
  const src = await source("../components/on-street-admin/OnStreetStreetDetail.js");
  for (const campo of ["Empresa", "Estacionamiento", "Área", "Nombre de la Calle", "Estado", "Creación", "Última actualización"]) {
    assert.match(src, new RegExp(`label="${campo}"`), `falta el campo "${campo}"`);
  }
});

// 5. Editar y guardar funciona -- reutiliza StructureEntityForm con
// cancelHref/onSaved apuntando de vuelta a la ficha On Street (nunca al
// comportamiento por defecto que redirige a /estacionamientos/...).
test("StructureEntityForm: cancelHref/onSaved son opcionales y retrocompatibles (mismo comportamiento de siempre si no se pasan)", async () => {
  const src = await source("../components/estacionamientos/StructureEntityForm.js");
  assert.match(src, /cancelHref: cancelHrefOverride = null, onSaved = null/, "props nuevas con default null -- no cambian el comportamiento existente de StructureFormRoute");
  assert.match(src, /const cancelHref = cancelHrefOverride \|\| defaultCancelHref/);
  assert.match(src, /if \(onSaved\) \{\s*onSaved\(body\.data\);\s*\} else \{/, "onSaved reemplaza el redirect por defecto solo cuando se provee explícitamente");
});

test("OnStreetAreaDetail/OnStreetStreetDetail: el modo edición pasa cancelHref/onSaved apuntando de vuelta a la propia ficha On Street", async () => {
  const area = await source("../components/on-street-admin/OnStreetAreaDetail.js");
  const street = await source("../components/on-street-admin/OnStreetStreetDetail.js");
  assert.match(area, /cancelHref=\{fichaHref\}/);
  assert.match(area, /const fichaHref = `\/on-street-qr\/areas\/\$\{id\}`/);
  assert.match(street, /cancelHref=\{fichaHref\}/);
  assert.match(street, /const fichaHref = `\/on-street-qr\/calles\/\$\{id\}`/);
});

// 6. Usuario sin permisos no puede modificar -- la ficha usa el mismo GET
// autorizado de On Street (authorizeOnStreetAdminRequest) y la escritura
// sigue pasando por el PATCH ya protegido de Off Street
// (authorizeParkingRequest + PARKINGS_MANAGE, sin cambios) -- no se creó
// ningún endpoint de escritura nuevo ni más permisivo.
test("Rutas de ficha (areas/[id], calles/[id]) exigen authorizeOnStreetAdminRequest, igual que el resto de On Street; no exponen ningún PATCH propio", async () => {
  const areaRoute = await source("../app/api/on-street-qr/areas/[id]/route.js");
  const streetRoute = await source("../app/api/on-street-qr/calles/[id]/route.js");
  for (const src of [areaRoute, streetRoute]) {
    assert.match(src, /authorizeOnStreetAdminRequest/);
    assert.doesNotMatch(src, /export async function PATCH/, "la escritura reutiliza el PATCH ya existente de Off Street, no se duplica aquí");
  }
});

// 7. Calles relacionadas aparecen en la ficha del Área.
test("OnStreetAreaDetail: muestra la tabla 'Calles del área' con Estado/N° Tramos y enlace Ficha", async () => {
  const src = await source("../components/on-street-admin/OnStreetAreaDetail.js");
  assert.match(src, /Calles del área/);
  assert.match(src, /"Calle", "Estado", "N° Tramos", "Acción"/);
  assert.match(src, /street\.segmentCount/);
});

// 8. Click en una Calle desde la ficha del Área abre la ficha de Calle On Street.
test("OnStreetAreaDetail: cada fila de Calle enlaza a /on-street-qr/calles/[id] (ficha On Street, no /estacionamientos/...)", async () => {
  const src = await source("../components/on-street-admin/OnStreetAreaDetail.js");
  assert.match(src, /href=\{`\/on-street-qr\/calles\/\$\{street\.id\}`\}/);
});

// 9. "+ Nueva calle" conserva automáticamente el contexto del Área
// (Empresa/Estacionamiento/Área ya resueltos, no se piden de nuevo).
test("OnStreetAreaDetail: '+ Nueva calle' enlaza a /on-street-qr/calles/nueva con parkingId y areaId ya resueltos", async () => {
  const src = await source("../components/on-street-admin/OnStreetAreaDetail.js");
  assert.match(src, /\/on-street-qr\/calles\/nueva\?parkingId=\$\{encodeURIComponent\(parking\.id\)\}&areaId=\$\{encodeURIComponent\(id\)\}/);
});

test("OnStreetQuickCreate: con initialParkingId/initialSectorId, esos campos quedan preseleccionados y deshabilitados (no se vuelven a pedir)", async () => {
  const src = await source("../components/on-street-admin/OnStreetQuickCreate.js");
  assert.match(src, /initialParkingId = "", initialSectorId = ""/);
  assert.match(src, /useState\(initialParkingId\)/);
  assert.match(src, /useState\(initialSectorId\)/);
  assert.match(src, /disabled=\{Boolean\(initialParkingId\)\}/);
  assert.match(src, /disabled=\{!parkingId \|\| Boolean\(initialSectorId\)\}/);
});

test("/on-street-qr/calles/nueva: lee parkingId/areaId de searchParams y los pasa como contexto ya conocido", async () => {
  const src = await source("../app/on-street-qr/calles/nueva/page.js");
  assert.match(src, /searchParams/);
  assert.match(src, /initialParkingId=\{initialParkingId\} initialSectorId=\{initialSectorId\}/);
});
