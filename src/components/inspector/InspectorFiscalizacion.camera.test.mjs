import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// Cámara nativa Android para evidencia fotográfica (corrección 2026-08-31):
// <input type="file" capture="environment"> abría el administrador de
// archivos en vez de la cámara dentro del WebView de Capacitor (bug real
// reportado en el Samsung físico) -- se agrega el plugin oficial
// @capacitor/camera para Android, sin tocar el comportamiento PC/web
// existente. Pruebas por inspección de código (mismo criterio que el
// resto de Inspector: sin jsdom en este proyecto).
const source = await readFile(new URL("./InspectorFiscalizacion.js", import.meta.url), "utf8");

test("cámara nativa: solo se usa en Android Y con el plugin realmente registrado (isPluginAvailable) -- nunca se asume, así que una APK vieja sin sincronizar sigue funcionando con el <input type=\"file\"> de siempre", () => {
  assert.match(source, /function isNativeCameraAvailable\(\) \{/);
  assert.match(source, /detectPlatform\(\) === PLATFORM\.ANDROID && Boolean\(window\.Capacitor\?\.isPluginAvailable\?\.\("Camera"\)\)/);
});

test("cámara nativa: abre DIRECTAMENTE la cámara trasera -- CameraSource.Camera (nunca Prompt/Photos) + CameraDirection.Rear, jamás un selector de galería/archivos", () => {
  assert.match(source, /source: CameraSource\.Camera/);
  assert.doesNotMatch(source, /CameraSource\.Prompt|CameraSource\.Photos/);
  assert.match(source, /direction: CameraDirection\.Rear/);
});

test("cámara nativa: NUNCA guarda en la galería pública del teléfono (saveToGallery: false) -- coherente con almacenamiento privado de evidencias", () => {
  assert.match(source, /saveToGallery: false/);
});

test("cámara nativa y <input type=\"file\"> comparten la MISMA función para agregar la foto al estado (agregarFotoBlob) -- una sola fuente de verdad para compresión/almacenamiento, sin importar el origen de la imagen", () => {
  assert.match(source, /const agregarFotoBlob = useCallback\(async \(rawFile\) => \{/);
  const agregarFotoBody = source.slice(source.indexOf("async function agregarFoto(event)"), source.indexOf("async function capturarFotoNativa()"));
  assert.match(agregarFotoBody, /await agregarFotoBlob\(file\);/, "el <input type=\"file\"> (PC/web) debe pasar por agregarFotoBlob");
  const capturaBody = source.slice(source.indexOf("async function capturarFotoNativa()"), source.indexOf("function quitarFoto(id)"));
  assert.match(capturaBody, /await agregarFotoBlob\(blob\);/, "la cámara nativa también debe pasar por agregarFotoBlob");
});

test("cámara nativa: respeta el límite de 3 fotografías (MAX_FOTOS), igual que el flujo web -- no se puede exceder el límite tomando fotos con la cámara nativa", () => {
  const capturaBody = source.slice(source.indexOf("async function capturarFotoNativa()"), source.indexOf("function quitarFoto(id)"));
  assert.match(capturaBody, /if \(fotos\.length >= MAX_FOTOS\) return;/);
  assert.match(source, /current\.length >= MAX_FOTOS \? current : \[\.\.\.current,/, "agregarFotoBlob también revalida el límite de forma atómica (evita condiciones de carrera)");
});

test("cámara nativa: cancelar (botón atrás) se descarta en silencio -- no muestra un error al inspector por simplemente cerrar la cámara sin tomar foto", () => {
  const capturaBody = source.slice(source.indexOf("async function capturarFotoNativa()"), source.indexOf("function quitarFoto(id)"));
  assert.match(capturaBody, /if \(\/cancel\/i\.test\(message\)\) return;/);
});

test("cámara nativa: un error real (permiso denegado, hardware) SÍ informa al inspector, sin tecnicismos crudos", () => {
  const capturaBody = source.slice(source.indexOf("async function capturarFotoNativa()"), source.indexOf("function quitarFoto(id)"));
  assert.match(capturaBody, /setError\("No fue posible tomar la fotografía\. Verifica el permiso de cámara en Ajustes de Android\."\)/);
});

test("el botón de la cámara elige la función correcta según la plataforma -- capturarFotoNativa en Android con plugin, el <input> de siempre en cualquier otro caso (PC/web sin tocar)", () => {
  assert.match(source, /onClick=\{useNativeCamera \? capturarFotoNativa : \(\) => fileInputRef\.current\?\.click\(\)\}/);
});

test("el <input type=\"file\"> original (PC/web) sigue existiendo tal cual, con el mismo accept/capture -- ninguna regresión en ese flujo", () => {
  assert.match(source, /<input ref=\{fileInputRef\} type="file" accept="image\/jpeg,image\/png,image\/webp" capture="environment" onChange=\{agregarFoto\} className="hidden" \/>/);
});

test("no se tocó ningún otro flujo (fiscalización/SMS/GPS/RBAC/APIs) -- el POST de registro y la subida de evidencia siguen exactamente iguales", () => {
  assert.match(source, /fetch\("\/api\/inspector\/inspections", \{/);
  assert.match(source, /fetch\(`\/api\/inspector\/inspections\/\$\{inspectionId\}\/evidence`/);
  assert.doesNotMatch(source, /navigator\.geolocation\.watchPosition|enableHighAccuracy: true/, "GPS no debe haberse tocado (sigue best-effort, enableHighAccuracy:false)");
});

test("AndroidManifest.xml declara el permiso CAMERA explícitamente -- el plugin lo solicita en runtime en vez de omitir el chequeo", async () => {
  const manifest = await readFile(new URL("../../../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8");
  assert.match(manifest, /<uses-permission android:name="android\.permission\.CAMERA" \/>/);
});

test("capacitor.settings.gradle incluye el plugin @capacitor/camera (npx cap sync ya ejecutado) -- no basta con instalar el paquete npm", async () => {
  const settings = await readFile(new URL("../../../android/capacitor.settings.gradle", import.meta.url), "utf8");
  assert.match(settings, /capacitor-camera/);
});
