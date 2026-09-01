import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Componentes React de la app de Inspectores (Etapa 3): no testeables
// directo bajo `node --test` (hooks/DOM/fetch) -- verificación por fuente,
// mismo patrón ya usado en el resto de la suite.

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("InspectorFiscalizacion: botones de foto ya NO son placeholders deshabilitados -- capturan/seleccionan un archivo real", async () => {
  const src = await source("../../components/inspector/InspectorFiscalizacion.js");
  assert.doesNotMatch(src, /disponible en una próxima etapa/, "el placeholder de Etapa 1/2 debe haber sido reemplazado");
  assert.match(src, /accept="image\/jpeg,image\/png,image\/webp" capture="environment"/, "prioriza la cámara del teléfono, mismo criterio del bucket (JPEG/PNG/WebP)");
  assert.match(src, /compressImageFile/, "comprime antes de subir");
});

test("InspectorFiscalizacion: la evidencia se sube DESPUÉS de confirmado el registro -- nunca antes (evita foto huérfana, §42)", async () => {
  const src = await source("../../components/inspector/InspectorFiscalizacion.js");
  const registroIndex = src.indexOf("setRegistro(body.data);");
  const subidaIndex = src.indexOf("for (const foto of fotos)");
  assert.ok(registroIndex > 0 && subidaIndex > registroIndex, "la subida de fotos debe ocurrir después de confirmado el registro principal");
});

test("InspectorFiscalizacion: un fallo al subir una foto no se presenta como falso éxito -- se informa y se puede reintentar, sin invalidar la fiscalización ya creada", async () => {
  const src = await source("../../components/inspector/InspectorFiscalizacion.js");
  assert.match(src, /errores\.push\(\{ fotoId: foto\.id, message: cause\.message \}\)/);
  assert.match(src, /function reintentarFoto/);
});

test("InspectorFiscalizacion: GPS best-effort captura accuracy y timestamp además de lat/lng, nunca bloquea el envío si falla", async () => {
  const src = await source("../../components/inspector/InspectorFiscalizacion.js");
  assert.match(src, /accuracy: position\.coords\.accuracy \?\? null/);
  assert.match(src, /timestamp: position\.timestamp/);
  assert.match(src, /setGpsError\(true\)/);
  assert.doesNotMatch(src, /disabled=\{[^}]*!coords/, "el botón de registrar nunca debe deshabilitarse por falta de GPS");
});

test("InspectorFiscalizacion: el selector de ubicación solo aparece para NO_SESSION/OTHER -- OVERSTAY ya tiene estacionamiento inequívoco desde la sesión real", async () => {
  const src = await source("../../components/inspector/InspectorFiscalizacion.js");
  assert.match(src, /const showLocationPicker = inspectionType !== "OVERSTAY";/);
});

test("InspectorLocationPicker: persiste el contexto en sessionStorage (no localStorage -- se limpia al cerrar la pestaña) y 'CAMBIAR UBICACIÓN' lo limpia explícitamente", async () => {
  const src = await source("../../components/inspector/InspectorLocationPicker.js");
  assert.match(src, /window\.sessionStorage\.setItem\(STORAGE_KEY/);
  assert.match(src, /window\.sessionStorage\.removeItem\(STORAGE_KEY\)/);
  assert.match(src, /CAMBIAR UBICACIÓN/);
  assert.doesNotMatch(src, /window\.localStorage/);
});

test("InspectorLocationPicker: la consulta de opciones usa /api/inspector/context (endpoint propio del Inspector, no el administrativo de On Street)", async () => {
  const src = await source("../../components/inspector/InspectorLocationPicker.js");
  assert.match(src, /authenticatedFetch\("\/api\/inspector\/context"/);
  assert.doesNotMatch(src, /\/api\/on-street-qr\//, "el Inspector no debe depender de un endpoint administrativo (distinto RBAC)");
});

test("OnStreetFiscalizaciones: doble clic abre detalle READ ONLY con evidencia, sin ningún control de edición del hecho histórico", async () => {
  const src = await source("../../components/on-street-admin/OnStreetFiscalizaciones.js");
  assert.match(src, /onRowDoubleClick=\{setSelected\}/);
  assert.match(src, /Consulta de solo lectura/);
  assert.doesNotMatch(src, /method: "PATCH"|method: "PUT"|method: "DELETE"/, "el detalle administrativo de fiscalizaciones nunca debe mutar el hecho histórico");
});
