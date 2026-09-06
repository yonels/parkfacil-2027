import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// Complemento Fase 6A/6B — encuadre de patente + recorte real + flash/torch.
// Mismo enfoque que el resto de tests de este proyecto para componentes
// React sin infraestructura de render (sin jsdom/testing-library): se
// verifica por contrato sobre el código fuente + las reglas puras ya
// cubiertas por platePhotoFrame.test.mjs/platePhotoLowLight.test.mjs. No
// son tests frágiles de whitespace: cada aserción ancla a un
// identificador/token estable, no a formato exacto.

const source = await readFile(new URL("./PlatePhotoCapture.js", import.meta.url), "utf8");

// ---- §2/§5: proporción del marco + recorte real (no solo visual) ----

test("el componente reutiliza el único cálculo del marco (platePhotoFrame.mjs) -- no un número mágico paralelo", () => {
  assert.match(source, /import \{ computePlateCropOutputSize, computePlateFrameRect \} from "@\/lib\/offStreet\/platePhotoFrame\.mjs"/);
  assert.doesNotMatch(source, /2\.77/);
});

test("drawPlateCrop recorta con el rectángulo real del marco (frame.x/y/width/height), no el video/imagen completos", () => {
  assert.match(
    source,
    /const frame = computePlateFrameRect\(sourceWidth, sourceHeight\);[\s\S]{0,400}ctx\.drawImage\(source, frame\.x, frame\.y, frame\.width, frame\.height, 0, 0, outSize\.width, outSize\.height\);/
  );
});

test("capture() (cámara en vivo) usa las dimensiones NATIVAS del video (videoWidth/videoHeight), no un valor fijo -- cubre portrait/landscape sin CSS/devicePixelRatio de por medio", () => {
  assert.match(source, /drawPlateCrop\(video, video\.videoWidth, video\.videoHeight\)/);
});

test("handleFileSelected (fallback sin cámara en vivo) también recorta al marco -- no guarda la imagen completa en ningún camino", () => {
  assert.match(source, /const canvas = drawPlateCrop\(bitmap, width, height\);/);
  assert.doesNotMatch(source, /drawToCanvas/);
});

test("el <video> se muestra en su proporción nativa (sin object-fit/cover) -- evita reproducir la matemática de escala+offset de cover para el recorte", () => {
  const videoTag = source.match(/<video [^>]*\/>/)[0];
  assert.match(videoTag, /className="block w-full h-auto"/);
  assert.doesNotMatch(videoTag, /object-cover|object-contain|aspect-\[/);
});

test("no se agranda la imagen: computePlateCropOutputSize solo se usa para acotar el máximo, nunca para forzar un tamaño mayor al recorte real", () => {
  assert.match(source, /const outSize = computePlateCropOutputSize\(frame, PLATE_CROP_MAX_WIDTH_PX\);/);
});

// ---- §7/§8: flash/torch -- detección real, nunca asumida ----

test("torch: primero se prueba el mecanismo estándar del navegador (MediaStreamTrack.getCapabilities().torch)", () => {
  assert.match(source, /const capabilities = track\?\.getCapabilities\?\.\(\);/);
  assert.match(source, /webSupported = Boolean\(capabilities && "torch" in capabilities && capabilities\.torch !== false\);/);
});

test("torch: fallback nativo opcional reutiliza window.ParkFacilDevice -- nunca crea un segundo bridge", () => {
  assert.match(source, /function getNativeDeviceBridge\(\) \{\s*\n\s*if \(typeof window === "undefined"\) return null;\s*\n\s*return window\.ParkFacilDevice \|\| null;/);
  // Una sola referencia real al global window.ParkFacilDevice en código
  // (además de la que aparece en un comentario explicando esta misma
  // regla) -- nunca un segundo objeto/bridge propio.
  const codeOnly = source.replace(/\/\/.*$/gm, "");
  assert.equal((codeOnly.match(/window\.ParkFacilDevice/g) || []).length, 1);
});

test("torch: el fallback nativo solo se intenta cuando el navegador NO expone torch, nunca en paralelo/primero", () => {
  assert.match(
    source,
    /if \(webSupported\) \{\s*\n\s*setTorchAvailable\(true\);\s*\n\s*return;\s*\n\s*\}\s*\n\s*const nativeAvailable = await detectNativeFlash\(\);/
  );
});

// ---- §8: botón visible solo si hay soporte real; nunca rompe si no lo hay ----

test("el botón de Flash solo se renderiza cuando torchAvailable es true", () => {
  assert.match(source, /\{torchAvailable \? \(\s*\n\s*<button[\s\S]{0,200}onClick=\{\(\) => void toggleTorch\(\)\}/);
});

test("capturar nunca depende del estado del flash -- funciona igual con o sin torch disponible/activado", () => {
  const fnStart = source.indexOf("async function capture()");
  const fnEnd = source.indexOf("async function handleFileSelected");
  const fn = source.slice(fnStart, fnEnd);
  assert.doesNotMatch(fn, /torchAvailable/);
  assert.doesNotMatch(fn, /torchOn/);
});

// ---- §9: torch continuo (se activa ANTES de capturar, no un destello al tomar la foto) ----

test("no existe ningún destello automático al capturar -- el torch solo lo enciende/apaga el operador vía toggleTorch", () => {
  const fnStart = source.indexOf("async function capture()");
  const fnEnd = source.indexOf("async function handleFileSelected");
  const fn = source.slice(fnStart, fnEnd);
  assert.doesNotMatch(fn, /setTorchOn|applyConstraints|setNativeTorch/);
});

// ---- §10: baja luz -- estimación simple, no visión artificial ----

test("la detección de poca luz reutiliza platePhotoLowLight.mjs (luminancia simple), no agrega una librería nueva", () => {
  assert.match(source, /import \{ averageLuminance, isLowLight \} from "@\/lib\/offStreet\/platePhotoLowLight\.mjs"/);
  assert.match(source, /setLowLightWarning\(isLowLight\(averageLuminance\(data\)\)\);/);
});

test("el flash NUNCA se activa automáticamente por baja luz -- solo se muestra el aviso, la decisión es del operador", () => {
  const noticeIndex = source.indexOf("Poca iluminación detectada");
  assert.ok(noticeIndex > -1);
  const surrounding = source.slice(Math.max(0, noticeIndex - 400), noticeIndex + 100);
  assert.doesNotMatch(surrounding, /toggleTorch\(\)|setTorchOn\(true\)/);
});

// ---- §11: fallback si el torch falla -- nunca aborta la captura/el ingreso ----

test("un fallo al activar el torch muestra un aviso no bloqueante y nunca lanza/aborta", () => {
  assert.match(source, /No fue posible activar el flash\. Mejore la iluminación o acerque el dispositivo\./);
  const fnStart = source.indexOf("async function toggleTorch()");
  const fnEnd = source.indexOf("function stopStream()");
  const fn = source.slice(fnStart, fnEnd);
  assert.match(fn, /try \{[\s\S]*\} catch \{/);
});

// ---- §13: ciclo de vida -- apagar el torch al cerrar/cancelar/desmontar ----

test("cerrar el stream (usePhoto/cancelar) siempre pasa por stopStream, que apaga el torch antes de detener las pistas", () => {
  assert.match(
    source,
    /function stopStream\(\) \{\s*\n\s*void turnOffTorch\(\);\s*\n\s*streamRef\.current\?\.getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\);/
  );
  assert.match(source, /async function usePhoto\(\) \{[\s\S]{0,200}stopStream\(\);/);
  assert.match(source, /function cancel\(\) \{\s*\n\s*stopStream\(\);/);
});

test("el desmonte del componente (cleanup del efecto de montaje) también apaga el torch, no solo detiene las pistas", () => {
  assert.match(
    source,
    /return \(\) => \{\s*\n\s*cancelled = true;\s*\n\s*void turnOffTorch\(\);\s*\n\s*streamRef\.current\?\.getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\);/
  );
});

test("turnOffTorch es no-op si el torch no estaba encendido -- nunca llama a applyConstraints/setNativeTorch de más", () => {
  assert.match(source, /async function turnOffTorch\(\) \{\s*\n\s*if \(!torchOnRef\.current\) return;/);
});

// ---- §14/§16.11: contrato de salida sin cambios -- Fase 6B sigue recibiendo la MISMA imagen ----

test("onCapture entrega exactamente el mismo contrato de siempre (base64/mimeType/sizeBytes/previewUrl) -- PosTerminal.js no necesita cambios", () => {
  assert.match(
    source,
    /onCapture\(\{ base64, mimeType: "image\/jpeg", sizeBytes: preview\.blob\.size, previewUrl: preview\.url \}\);/
  );
});

// ---- §17: no se agregó nada fuera de alcance ----

test("no se agregó OCR, reconocimiento de caracteres ni detección automática de la patente", () => {
  assert.doesNotMatch(source, /ocr|tesseract|reconoc|detectPlate/i);
});

test("no se tocó la lógica REQUIRED/OPTIONAL/DISABLED -- el prop 'required' se sigue usando tal cual, sin nueva lógica de gating", () => {
  assert.match(source, /export default function PlatePhotoCapture\(\{ plate, required, onCapture, onCancel \}\)/);
  assert.match(source, /\{required \? \(/);
});
