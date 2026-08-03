import test from "node:test";
import assert from "node:assert/strict";
import { getDocumento, getDocumentos } from "./documentos.js";

test("el catálogo usa las tres categorías simples aprobadas", () => {
  const allowed = new Set(["General", "Módulos", "Cambios"]);
  assert.ok(getDocumentos().length > 0);
  assert.ok(getDocumentos().every((document) => allowed.has(document.category)));
});

test("todos los enlaces documentales resuelven archivos reales", async () => {
  for (const document of getDocumentos()) {
    const resolved = await getDocumento(document.slug);
    assert.equal(resolved.slug, document.slug);
    assert.ok(resolved.contenido.trim().length > 0);
  }
});

test("arquitectura y documentación de módulos están visibles", () => {
  const documents = getDocumentos();
  assert.ok(documents.some((document) => document.title === "Arquitectura general"));
  assert.ok(documents.some((document) => document.slug === "stage-03-estacionamientos"));
  assert.ok(documents.some((document) => document.slug === "etapa-19-centro-notificaciones"));
});
