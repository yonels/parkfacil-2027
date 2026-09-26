import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// POS Entry/Exit — Fase 2 (Entrada V2): contratos del flujo en
// PosTerminal.js, /api/data-entry y proxy. PosTerminal es un componente
// React de cliente y las rutas importan "server-only" (no cargan bajo
// node --test): se fija el contrato desplegado leyendo el código fuente,
// mismo criterio que el resto de tests *.contract.test.mjs del POS.

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const terminal = read("./PosTerminal.js");
const dataEntry = read("../../app/api/data-entry/route.js");
const proxy = read("../../proxy.js");

function fnBody(source, signature, nextMarker) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `no se encontró ${signature}`);
  const end = nextMarker ? source.indexOf(nextMarker, start + signature.length) : start + 4000;
  return source.slice(start, end > start ? end : start + 4000);
}

const submitEntry = fnBody(terminal, "async function submitEntry(event", "const navItems = [");
const confirmEntry = fnBody(terminal, "function confirmEntryPlate()", "// OCR (cámara)");
const correctEntry = fnBody(terminal, "function correctEntryPlate()", "// CONFIRMAR:");
const proposeEntry = fnBody(terminal, "function proposeEntryPlate(", "function continueManualPlate()");
const continueManual = fnBody(terminal, "function continueManualPlate()", "// CORREGIR:");
const ocrHandler = fnBody(terminal, "async function handleOcrCapture(photo)", "// Voz: solo reconocimiento");
const voiceStart = fnBody(terminal, "async function startVoiceCapture()", "function cancelVoiceCapture()");
const formSubmit = fnBody(terminal, "function handleEntryFormSubmit(event)", "// Búsqueda por patente exclusiva de SALIDA");
const entryForm = fnBody(terminal, "function renderEntryV2Form()", "function renderIngresoPanel()");

// ---- 1-5) Manual, confirmación obligatoria, corrección ----

test("1/2. manual: CONTINUAR valida el formato y solo PROPONE (nunca registra)", () => {
  assert.match(continueManual, /if \(!POS_PLATE_REGEX\.test\(formatted\)\) \{\s*setEntryFailure\("INVALID_PLATE"\);/);
  assert.match(continueManual, /proposeEntryPlate\(formatted, PLATE_SOURCES\.MANUAL\)/);
  assert.doesNotMatch(continueManual, /submitEntry|fetch\(/);
});

test("3. el input normaliza mientras se escribe (mismas reglas que Fase 0/1)", () => {
  assert.match(entryForm, /setEntryPlate\(formatPosPlateInput\(event\.target\.value\)\)/);
  assert.match(entryForm, /autoCapitalize="characters"/);
});

test("4. confirmación obligatoria: submitEntry rechaza toda patente que no haya sido CONFIRMADA", () => {
  assert.match(submitEntry, /const confirmedPlate = confirmedPlateOverride \?\? entryConfirmedPlate;/);
  assert.match(submitEntry, /if \(!confirmedPlate \|\| confirmedPlate !== plate\) \{[\s\S]{0,120}setEntryStep\("CONFIRM"\);\s*return;/);
  // El chequeo de confirmación ocurre ANTES del POST.
  assert.ok(submitEntry.indexOf("confirmedPlate !== plate") < submitEntry.indexOf('fetch("/api/data-entry"'));
  // Toda propuesta (manual/OCR/voz) invalida una confirmación previa.
  assert.match(proposeEntry, /setEntryConfirmedPlate\(""\);/);
  assert.match(proposeEntry, /setEntryStep\("CONFIRM"\);/);
});

test("4. el form avanza por pasos: PLATE -> CONFIRM -> registro (Enter nunca salta la confirmación)", () => {
  assert.match(formSubmit, /if \(entryStep === "PLATE"\) \{\s*continueManualPlate\(\);\s*return;/);
  assert.match(formSubmit, /if \(entryStep === "CONFIRM"\) \{\s*confirmEntryPlate\(\);\s*return;/);
  assert.match(entryForm, /<form onSubmit=\{handleEntryFormSubmit\}/);
  assert.match(entryForm, /Patente detectada \/ ingresada/);
  assert.match(entryForm, /CONFIRMAR/);
  assert.match(entryForm, /CORREGIR/);
});

test("5. CORREGIR vuelve al campo conservando la patente y no registra nada", () => {
  assert.match(correctEntry, /setEntryConfirmedPlate\(""\);/);
  assert.match(correctEntry, /setEntryStep\("PLATE"\);/);
  assert.doesNotMatch(correctEntry, /setEntryPlate\(|submitEntry|fetch\(/);
});

// ---- 6-11) OCR y voz solo proponen ----

test("6/7. OCR propone la patente y NUNCA registra automáticamente", () => {
  assert.match(ocrHandler, /const result = await recognizePlate\(photo\.base64\);/);
  assert.match(ocrHandler, /proposeEntryPlate\(\s*result\.proposal\.plate,\s*PLATE_SOURCES\.OCR,/);
  assert.doesNotMatch(ocrHandler, /submitEntry|confirmEntryPlate|fetch\(/);
});

test("8. OCR fallido deja un mensaje claro y el ingreso manual intacto (sigue en PLATE)", () => {
  assert.match(ocrHandler, /if \(!result\.ok\) \{\s*setEntryFailure\(result\.code\);\s*return;/);
  assert.doesNotMatch(ocrHandler, /setEntryStep\("CONFIRM"\)/);
});

test("OCR con baja confianza muestra aviso de revisión en la confirmación", () => {
  assert.match(ocrHandler, /result\.proposal\.lowConfidence \? entryErrorMessage\("OCR_LOW_CONFIDENCE"\)/);
});

test("9/10. voz propone la patente y NUNCA registra automáticamente", () => {
  assert.match(voiceStart, /proposeEntryPlate\(outcome\.plate, PLATE_SOURCES\.VOICE,/);
  assert.doesNotMatch(voiceStart, /submitEntry|confirmEntryPlate|fetch\(/);
});

test("11. voz no soportada / sin reconocimiento local -> mensaje y el manual sigue disponible", () => {
  assert.match(voiceStart, /support\.status === "UNSUPPORTED" \? "VOICE_UNSUPPORTED" : "VOICE_LOCAL_UNAVAILABLE"/);
  assert.match(voiceStart, /if \(support\.status === "DOWNLOADABLE"\) \{/);
  assert.match(entryForm, /Escuchando… Cancelar/);
  assert.match(entryForm, /onClick=\{cancelVoiceCapture\}/);
});

// ---- 12-14) Foto de patente ----

test("12. foto REQUIRED bloquea el registro sin foto (UI + submitEntry + backend)", () => {
  assert.match(submitEntry, /if \(platePhotoMode === "REQUIRED" && !entryPhoto\) \{/);
  assert.match(entryForm, /disabled=\{entrySubmitting \|\| alreadyInside \|\| \(platePhotoMode === "REQUIRED" && !entryPhoto\)\}/);
  assert.match(dataEntry, /PLATE_PHOTO_REQUIRED/);
});

test("13. foto OPTIONAL permite registrar sin foto", () => {
  assert.match(entryForm, /entryPhoto \|\| platePhotoMode === "REQUIRED" \? "REGISTRAR INGRESO" : "REGISTRAR SIN FOTO"/);
});

test("14. foto DISABLED: CONFIRMAR registra directo, sin paso ni captura de foto", () => {
  assert.match(confirmEntry, /if \(platePhotoMode === "DISABLED"\) \{\s*void submitEntry\(null, confirmedPlate\);\s*return;\s*\}\s*setEntryStep\("PHOTO"\);/);
  assert.match(entryForm, /entryStep === "PHOTO" && platePhotoMode !== "DISABLED"/);
});

test("OCR y evidencia son imágenes distintas: la lectura solo es evidencia si el operador lo elige", () => {
  assert.match(entryForm, /Usar la foto de la lectura/);
  assert.match(entryForm, /onClick=\{\(\) => capturedPlatePhoto\(ocrPhoto\)\}/);
  // Con GPS REQUIRED solo se ofrece reutilizarla si trae ubicación real.
  assert.match(entryForm, /platePhotoGpsMode !== "REQUIRED" \|\| \(ocrPhoto\?\.latitude != null && ocrPhoto\?\.longitude != null\)/);
  assert.match(terminal, /purpose="OCR"/);
  // La imagen del OCR nunca se envía por sí sola: solo entryPhoto viaja en el POST.
  assert.doesNotMatch(submitEntry, /ocrPhoto\.base64/);
});

// ---- 15-17) Duplicados y doble envío ----

test("15/16. 409 de vehículo ya ingresado se muestra como VEHÍCULO YA INGRESADO", () => {
  assert.match(submitEntry, /const failureCode = classifyEntryFailure\(response\.status, payload\);/);
  assert.match(entryForm, /Vehículo ya ingresado/);
  assert.match(dataEntry, /if \(existing\.data\) return fail\("Este vehículo ya se encuentra dentro del estacionamiento\.", 409, \{ code: "VEHICLE_ALREADY_INSIDE" \}\);/);
  assert.match(dataEntry, /if \(error\.code === "23505"\) return fail\("Este vehículo ya se encuentra dentro del estacionamiento\.", 409, \{ code: "VEHICLE_ALREADY_INSIDE" \}\);/);
  // Se conserva el cleanup de la foto huérfana antes de responder el 23505.
  assert.match(dataEntry, /if \(uploadedPhoto\) await removeOrphanedPlatePhoto\(current\.db, uploadedPhoto\.storagePath\);\s*\n\s*if \(error\.code === "23505"\)/);
});

test("17. doble toque: guarda síncrona, nunca dos POST de ENTRY", () => {
  assert.match(submitEntry, /if \(entrySubmitLockRef\.current\) return;/);
  assert.ok(submitEntry.indexOf("entrySubmitLockRef.current = true;") < submitEntry.indexOf('fetch("/api/data-entry"'));
  assert.match(submitEntry, /finally \{\s*entrySubmitLockRef\.current = false;\s*setEntrySubmitting\(false\);/);
  assert.match(confirmEntry, /if \(entrySubmitting \|\| entrySubmitLockRef\.current\) return;/);
  assert.match(entryForm, /\{entrySubmitting \? "Registrando\.\.\." : "CONFIRMAR"\}/);
});

// ---- 18-20) Fase 1 se conserva ----

test("18/20. ENTRY sigue usando la resolución segura de parking de Fase 1 (sin assignedParkingIds[0])", () => {
  assert.match(dataEntry, /const resolved = await resolvePosOperationalParking\(authorization\);/);
  assert.doesNotMatch(dataEntry, /assignedParkingIds\?\.\[0\]/);
  assert.match(dataEntry, /isRequestedParkingConsistent\(resolved\.parkingId, requestedParkingId\)/);
  // El cliente nunca envía parkingId en ENTRY.
  const body = submitEntry.slice(submitEntry.indexOf("body: JSON.stringify({"), submitEntry.indexOf("const payload = await response.json()"));
  assert.doesNotMatch(body, /parkingId/);
});

test("19. operador correcto: el backend usa posOperationActor (nombre, no correo técnico)", () => {
  assert.match(dataEntry, /actor: \{ \.\.\.posOperationActor\(authorization\.context\), parkingId: parking\.id \}/);
  assert.match(dataEntry, /entry_operator_name: current\.actor\.name/);
});

// ---- 11/13) Hora del servidor y deviceInfo ----

test("la hora oficial del ingreso la fija el servidor (el cliente no envía entry_at)", () => {
  const body = submitEntry.slice(submitEntry.indexOf("body: JSON.stringify({"), submitEntry.indexOf("const payload = await response.json()"));
  assert.doesNotMatch(body, /entry_at|entryAt|new Date\(\)/);
  assert.doesNotMatch(dataEntry.slice(dataEntry.indexOf("const row = { code: code(\"ING\")"), dataEntry.indexOf("const row = { code: code(\"ING\")") + 400), /entry_at/);
});

test("deviceInfo se sigue recolectando en cada ENTRY (sin terminal_id nuevo)", () => {
  assert.match(submitEntry, /const deviceInfo = await collectDeviceInfoForEntry\(\);/);
  assert.doesNotMatch(terminal, /terminal_id|terminalId/);
});

// ---- 21) Regresión del ENTRY existente ----

test("21. regresión: mismo POST de ENTRY, mismo payload de foto, impresión después del POST", () => {
  assert.match(submitEntry, /action: "ENTRY",\s*plate,\s*source: "POS",\s*deviceInfo,/);
  assert.match(submitEntry, /platePhotoBase64: entryPhoto\.base64,/);
  assert.ok(submitEntry.indexOf('fetch("/api/data-entry"') < submitEntry.indexOf("await printLastEntryTicket(printPayload,"));
  assert.match(submitEntry, /if \(response\.status === 401\) \{\s*redirectToPosLogin\("sesion-expirada"\);/);
});

// ---- Infra: OCR servido localmente ----

test("proxy deja pasar /vendor/ (assets estáticos del OCR) sin abrir rutas de la app", () => {
  assert.match(proxy, /request\.nextUrl\.pathname\.startsWith\("\/vendor\/"\) \|\|/);
  assert.match(proxy, /matcher: \["\/\(\(\?!api\|_next\/static\|_next\/image\|_next\/webpack-hmr\|favicon\.ico\)\.\*\)"\]/);
});

test("al salir del terminal se libera el OCR y se corta la escucha de voz", () => {
  assert.match(terminal, /void releasePlateOcr\(\);/);
  assert.match(terminal, /useEffect\(\(\) => \(\) => \{\s*voiceController\?\.cancel\(\);\s*\}, \[voiceController\]\);/);
});
