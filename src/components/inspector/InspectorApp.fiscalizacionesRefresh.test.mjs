import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// Incidente CXPY93 (2026-09-03): una fiscalización real (SMS enviado, ticket
// impreso, confirmada en Production) no aparecía en Inspector -> Fiscalizaciones
// porque GET /api/inspector/inspections solo se pedía una vez al montar la
// app, y cualquier fallo de ese único pedido se convertía en [] en silencio
// -- indistinguible de "cero fiscalizaciones reales". Este archivo prueba,
// por inspección estructural del código fuente (mismo criterio que el resto
// de Inspector: no hay jsdom en este proyecto), que el refresco y el manejo
// de error quedaron corregidos sin tocar fiscalización/SMS/impresión/pagos.
const appSource = await readFile(new URL("./InspectorApp.js", import.meta.url), "utf8");
const listSource = await readFile(new URL("./InspectorFiscalizaciones.js", import.meta.url), "utf8");

// TAREA 7.A/B: entrar (o VOLVER) a Fiscalizaciones dispara loadFiscalizaciones.
test("TAREA 7.A/B: navegar a Fiscalizaciones (entrar o volver) vuelve a pedir GET /api/inspector/inspections", () => {
  const marker = "if (view !== INSPECTOR_VIEW.FISCALIZACIONES) return undefined;";
  assert.ok(appSource.includes(marker), "el efecto de refresco por navegación debe existir");
  const effectBlock = appSource.slice(appSource.indexOf(marker), appSource.indexOf(marker) + 500);
  assert.match(effectBlock, /window\.setTimeout\(\(\) => void loadFiscalizaciones\(\), 0\)/);
  assert.match(effectBlock, /\}, \[view, loadFiscalizaciones\]\);/, "debe depender de `view` (no de [] fijo) para volver a dispararse cada vez que `view` cambie a FISCALIZACIONES, incluida una segunda visita");
});

test("TAREA 7.A/B: el efecto de refresco NO depende de un arreglo vacío -- de lo contrario solo correría una vez, igual que el bug original", () => {
  const marker = "if (view !== INSPECTOR_VIEW.FISCALIZACIONES) return undefined;";
  const effectBlock = appSource.slice(appSource.indexOf(marker), appSource.indexOf(marker) + 500);
  assert.doesNotMatch(effectBlock, /\}, \[\]\);/);
});

// TAREA 6: background/resume reutiliza el MISMO mecanismo (loadFiscalizaciones),
// vía visibilitychange -- nunca un setInterval/polling continuo.
test("TAREA 6: volver de background revalida con el mismo loadFiscalizaciones, mediante visibilitychange -- nunca polling", () => {
  assert.match(appSource, /document\.addEventListener\("visibilitychange", handleVisibility\)/);
  const visBlock = appSource.slice(appSource.indexOf("function handleVisibility"), appSource.indexOf("function handleVisibility") + 300);
  assert.match(visBlock, /document\.visibilityState === "visible"/);
  assert.match(visBlock, /void loadFiscalizaciones\(\)/);
  assert.doesNotMatch(appSource, /setInterval\(/, "no debe introducirse ningún polling continuo");
});

// TAREA 7.C/G: refresco tras fiscalizar -- aparece sin reiniciar la app, y
// sin duplicar (reemplaza la lista completa, nunca hace append).
test("TAREA 7.C: tras registrar una fiscalización, se refresca la lista completa (loadFiscalizaciones), no solo el agregado local optimista", () => {
  const handlerBlock = appSource.slice(appSource.indexOf("function onFiscalizacionRegistrada"), appSource.indexOf("if (!checkedSession)"));
  assert.match(handlerBlock, /if \(row\?\.reused === false\) \{/, "TAREA 7.G / test previo: reused=true nunca duplica el agregado local optimista");
  assert.match(handlerBlock, /void loadFiscalizaciones\(\);/, "además del agregado local, se reconcilia con el servidor -- así reused=true también refleja la fila real sin duplicarla");
});

test("TAREA 7.G: loadFiscalizaciones REEMPLAZA la lista completa (setFiscalizaciones con el resultado del fetch), nunca hace append -- no puede duplicar filas", () => {
  const loaderBlock = appSource.slice(appSource.indexOf("const loadFiscalizaciones = useCallback"), appSource.indexOf("const loadFiscalizaciones = useCallback") + 500);
  assert.match(loaderBlock, /setFiscalizaciones\(data\.map\(mapApiInspection\)\);/);
  assert.doesNotMatch(loaderBlock, /setFiscalizaciones\(\(prev\)/, "loadFiscalizaciones no debe usar el prev-updater de append -- eso es exclusivo del agregado optimista en onFiscalizacionRegistrada");
});

// TAREA 7.D: un error HTTP nunca se convierte en [] -- debe lanzar, para que
// loadFiscalizaciones lo distinga de una lista real vacía.
test("TAREA 7.D: fetchInspectorInspections lanza en cualquier respuesta no-ok, nunca devuelve [] en silencio", () => {
  const fetchFn = appSource.slice(appSource.indexOf("async function fetchInspectorInspections"), appSource.indexOf("async function fetchInspectorInspections") + 400);
  assert.match(fetchFn, /if \(!response\.ok\) throw new Error\("FISCALIZACIONES_FETCH_FAILED"\);/);
  assert.doesNotMatch(fetchFn, /if \(!response\.ok\) return \[\];/, "esa era exactamente la causa raíz del incidente CXPY93 -- no debe reaparecer");
});

test("TAREA 7.D/E: loadFiscalizaciones distingue loading/success/error mediante fiscalizacionesStatus -- un catch marca 'error', nunca deja la lista en un [] indistinguible", () => {
  const loaderBlock = appSource.slice(appSource.indexOf("const loadFiscalizaciones = useCallback"), appSource.indexOf("const loadFiscalizaciones = useCallback") + 500);
  assert.match(loaderBlock, /setFiscalizacionesStatus\("loading"\)/);
  assert.match(loaderBlock, /setFiscalizacionesStatus\("success"\)/);
  assert.match(loaderBlock, /catch \{\s*setFiscalizacionesStatus\("error"\);\s*\}/);
});

test("el estado inicial es 'idle', no 'success' -- la pantalla nunca puede pensar erróneamente que ya confirmó una lista vacía antes del primer fetch real", () => {
  assert.match(appSource, /const \[fiscalizacionesStatus, setFiscalizacionesStatus\] = useState\("idle"\);/);
});

// TAREA 7.E/F: la pantalla de Fiscalizaciones muestra exactamente el mensaje
// de error + botón Reintentar, y el mensaje de vacío real SOLO en success.
test("TAREA 7.E: status==='error' muestra el mensaje exacto y un botón 'Reintentar' que llama a onRetry", () => {
  const errorBranch = listSource.slice(listSource.indexOf(': status === "error" ?'), listSource.indexOf(': fiscalizaciones.length === 0 ?'));
  assert.match(errorBranch, /No fue posible cargar las fiscalizaciones\./);
  assert.match(errorBranch, /onClick=\{onRetry\}/);
  assert.match(errorBranch, />\s*Reintentar\s*</);
});

test("TAREA 7.F: 'Aún no hay fiscalizaciones.' solo puede alcanzarse cuando status !== 'loading'/'idle'/'error' (es decir, 'success') Y fiscalizaciones.length === 0", () => {
  assert.match(listSource, /status === "loading" \|\| status === "idle" \? \(/);
  assert.match(listSource, /\) : status === "error" \? \(/);
  assert.match(listSource, /\) : fiscalizaciones\.length === 0 \? \(\s*<p[^>]*>Aún no hay fiscalizaciones\.<\/p>/);
});

test("TAREA 7.F: el mensaje de error nunca reutiliza el texto de lista vacía, y viceversa -- son ramas distintas del mismo condicional", () => {
  const errorBranch = listSource.slice(listSource.indexOf(': status === "error" ?'), listSource.indexOf(': fiscalizaciones.length === 0 ?'));
  assert.doesNotMatch(errorBranch, /Aún no hay fiscalizaciones\./);
});

// TAREA 7.H/I: nada de esto toca SMS, impresión ni pagos.
test("TAREA 7.H: ni InspectorApp.js ni InspectorFiscalizaciones.js envían SMS -- el refresco es puramente de lectura", () => {
  for (const forbidden of ["sendInspectionSmsIfNeeded", "sendInspectorCopySmsIfNeeded", "inspectorSms", "sms-report"]) {
    assert.doesNotMatch(appSource, new RegExp(forbidden), `InspectorApp.js no debe mencionar ${forbidden}`);
    assert.doesNotMatch(listSource, new RegExp(forbidden), `InspectorFiscalizaciones.js no debe mencionar ${forbidden}`);
  }
});

test("TAREA 7.I: ni InspectorApp.js ni InspectorFiscalizaciones.js tocan impresión (printerAdapter/CourtesyTicketPrint) ni pagos (Webpay/payment_transactions)", () => {
  for (const forbidden of ["printerAdapter", "CourtesyTicketPrint", "printBytes", "Webpay", "payment_transactions", "createTransaction"]) {
    assert.doesNotMatch(appSource, new RegExp(forbidden, "i"), `InspectorApp.js no debe mencionar ${forbidden}`);
    assert.doesNotMatch(listSource, new RegExp(forbidden, "i"), `InspectorFiscalizaciones.js no debe mencionar ${forbidden}`);
  }
});

test("register_on_street_inspection (registrar una fiscalización) no se toca en este cambio -- sigue viviendo solo en InspectorFiscalizacion.js/inspectorInspectionService.js", () => {
  assert.doesNotMatch(appSource, /register_on_street_inspection/);
});
