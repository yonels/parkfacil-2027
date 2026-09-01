import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { INSPECTOR_FISCALIZACION_MOTIVOS, INSPECTOR_FISCALIZACION_TYPE_BY_MOTIVO } from "./inspectorFiscalizacionMotivos.mjs";

test("los 3 motivos son exactamente los del enunciado, con su inspection_type real", () => {
  assert.deepEqual(INSPECTOR_FISCALIZACION_MOTIVOS, ["Exceso de tiempo", "Sin sesión", "Otro"]);
  assert.deepEqual(INSPECTOR_FISCALIZACION_TYPE_BY_MOTIVO, { "Exceso de tiempo": "OVERSTAY", "Sin sesión": "NO_SESSION", "Otro": "OTHER" });
});

const source = await readFile(new URL("./InspectorFiscalizacion.js", import.meta.url), "utf8");
const withoutComments = source.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

test("Etapa 2: registra la fiscalización con un POST real a /api/inspector/inspections, nunca simulado", () => {
  assert.match(source, /fetch\("\/api\/inspector\/inspections", \{/);
  assert.match(source, /method: "POST"/);
  assert.doesNotMatch(withoutComments, /Esta etapa no escribe en Production/, "esa era la simulación de la Etapa 1 -- ya no aplica");
});

test("nunca importa ni llama a Webpay/reconciliador/payment_transactions -- Inspectores no toca pagos (§23)", () => {
  for (const forbidden of ["Webpay", "reconcile", "payment_transactions", "createTransaction", "supabase"]) {
    assert.doesNotMatch(source, new RegExp(forbidden, "i"), forbidden);
  }
});

test("idempotencia (§12): la clave se genera una sola vez por montaje del formulario y se reutiliza en cada intento, nunca una nueva por click", () => {
  assert.match(source, /const idempotencyKey = useRef\(crypto\.randomUUID\(\)\);/);
  assert.match(source, /"idempotency-key": idempotencyKey\.current/);
});

test("regla crítica §9: exige confirmación explícita de 'vehículo presente' para Exceso de tiempo antes de habilitar el envío", () => {
  assert.match(source, /Confirme que el vehículo continúa estacionado/);
  assert.match(source, /requiresPresenceConfirmation && !vehiclePresentConfirmed/);
});

test("nunca acepta un teléfono manual del inspector -- el formulario no tiene ningún campo/estado de teléfono, solo lo menciona informativamente", () => {
  assert.doesNotMatch(withoutComments, /type="tel"|useState.*[Pp]hone|phoneInput/);
  assert.doesNotMatch(withoutComments, /body\?\.phone|"phone":/);
});

test("guarda de conexión (§21): sin conexión no se envía ni se simula éxito, se informa con claridad", () => {
  assert.match(source, /!navigator\.onLine/);
  assert.match(source, /Sin conexión: no es posible registrar/);
  assert.match(source, /disabled=\{!normalized \|\| busy \|\| !online/);
});

test("geolocalización opcional (§17, ampliado Etapa 3 con accuracy/timestamp): nunca bloquea el registro si el permiso se deniega", () => {
  assert.match(source, /navigator\.geolocation\.getCurrentPosition/);
  // El callback de error de getCurrentPosition solo marca gpsError -- nunca
  // establece un error que bloquee el formulario (ver disabled= más abajo,
  // que no depende de coords/gpsError).
  const geoCall = source.slice(source.indexOf("navigator.geolocation.getCurrentPosition"), source.indexOf("navigator.geolocation.getCurrentPosition") + 400);
  assert.match(geoCall, /\(\) => setGpsError\(true\)/);
  assert.doesNotMatch(source, /disabled=\{[^}]*!coords/, "el botón de registrar nunca debe depender de que haya GPS disponible");
});

// Corrección 2026-08-31: la última prueba física en el Samsung registró la
// fiscalización con latitude/longitude nulos. Causa real (ver
// AndroidManifest.xml): sin ACCESS_COARSE_LOCATION/ACCESS_FINE_LOCATION
// declarados, BridgeWebChromeClient.onGeolocationPermissionsShowPrompt de
// Capacitor (node_modules/@capacitor/android) rechaza el intento de
// geolocalización de la WebView antes de que llegue a pedir permiso en
// runtime -- navigator.geolocation.getCurrentPosition() nunca tuvo
// oportunidad real de funcionar en Android. El código JS de arriba
// (navigator.geolocation.getCurrentPosition, best-effort, no bloqueante)
// ya era correcto y NO se tocó -- el permiso es lo único que faltaba.
test("AndroidManifest.xml declara ACCESS_COARSE_LOCATION y ACCESS_FINE_LOCATION -- sin esto, Capacitor rechaza el intento de geolocalización de la WebView antes de pedir permiso en runtime, sin tocar código JS", async () => {
  const manifest = await readFile(new URL("../../../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8");
  assert.match(manifest, /<uses-permission android:name="android\.permission\.ACCESS_COARSE_LOCATION" \/>/);
  assert.match(manifest, /<uses-permission android:name="android\.permission\.ACCESS_FINE_LOCATION" \/>/);
});

// Etapa 3 (2026-08-28): la evidencia fotográfica real (captura/selección,
// compresión, subida) reemplazó el placeholder deshabilitado de Etapa 1/2
// -- cobertura detallada en inspectorEtapa3Ui.test.mjs. Este test solo
// confirma que el placeholder efectivamente desapareció, para que una
// futura edición no lo reintroduzca por error.
test("Etapa 3: el placeholder deshabilitado de fotografía ('disponible en una próxima etapa') ya no existe -- ver inspectorEtapa3Ui.test.mjs para la cobertura de la subida real", () => {
  assert.doesNotMatch(withoutComments, /disponible en una próxima etapa/);
});

test("REGISTRAR FISCALIZACIÓN está deshabilitado sin patente válida, mientras registra, sin conexión, o sin confirmar presencia cuando corresponde", () => {
  assert.match(source, /disabled=\{!normalized \|\| busy \|\| !online \|\| \(requiresPresenceConfirmation && !vehiclePresentConfirmed\)\}/);
});

// Etapa 3 final (2026-08-30): "Multa de cortesía" -- SOLO se ofrece
// imprimir cuando la fiscalización recién registrada es OVERSTAY (exceso
// de tiempo = sesión VENCIDO, ya confirmada por el servidor -- ver
// /api/inspector/inspections/route.js §9, que rechaza con 409 cualquier
// OVERSTAY cuya sesión no esté VENCIDO en ese instante). requiresPresence
// Confirmation es exactamente esa condición: submit() bloquea el registro
// de un OVERSTAY sin la casilla de presencia marcada, así que si
// "registro" llega a existir con ese flag en true, el servidor ya validó
// todo antes de aceptar el POST.
test("Multa de cortesía: el botón de impresión SOLO se muestra para OVERSTAY (VENCIDO) ya confirmado por el servidor -- nunca para NO_SESSION/OTHER", () => {
  assert.match(source, /import CourtesyTicketPrint from "\.\/CourtesyTicketPrint";/);
  assert.match(source, /\{requiresPresenceConfirmation \? \(\s*<CourtesyTicketPrint plate=\{normalized\} inspectedAt=\{registro\.inspectedAt\} inspectionId=\{registro\.id\} \/>\s*\) : null\}/);
});

test("Multa de cortesía: se monta DENTRO del bloque 'if (registro)' (fiscalización ya confirmada por el servidor) -- nunca antes de esa confirmación", () => {
  const registroBlockStart = source.indexOf("if (registro) {");
  const courtesyIndex = source.indexOf("<CourtesyTicketPrint");
  assert.ok(registroBlockStart >= 0 && courtesyIndex > registroBlockStart, "CourtesyTicketPrint debe aparecer después de 'if (registro) {', nunca en el formulario todavía sin confirmar");
});

test("Multa de cortesía: nunca llama a ningún endpoint de ParkFacil -- la impresión es puramente local (plugin nativo Capacitor Bluetooth Classic SPP en Android, o el agente HTTP local ya existente en 127.0.0.1 desde PC), nunca puede modificar/revertir/duplicar la fiscalización", async () => {
  const courtesySource = await readFile(new URL("./CourtesyTicketPrint.js", import.meta.url), "utf8");
  // El componente en sí no hace ninguna llamada de red directa -- ambos
  // transportes (printBytes/printCourtesyFineViaPcAgent) viven en
  // printerAdapter.js, ver ese archivo para la prueba de que su único
  // destino HTTP real es 127.0.0.1:19100, nunca un dominio de ParkFacil.
  assert.doesNotMatch(courtesySource, /fetch\(|authenticatedFetch\(/, "CourtesyTicketPrint no debe hacer ninguna llamada de red directa -- solo delega en printerAdapter.js");
  const adapterSource = await readFile(new URL("../../lib/inspector/printerAdapter.js", import.meta.url), "utf8");
  const fetchCalls = [...adapterSource.matchAll(/fetch\(\s*([A-Z_]+)/g)].map((m) => m[1]);
  assert.deepEqual(fetchCalls, ["PRINT_AGENT_URL"], "el único fetch() de printerAdapter.js debe apuntar al agente local de PC, nunca a otra URL");
  assert.match(adapterSource, /const PRINT_AGENT_URL = "http:\/\/127\.0\.0\.1:19100\/print";/, "el agente de impresión local, nunca un endpoint de ParkFacil");
});
