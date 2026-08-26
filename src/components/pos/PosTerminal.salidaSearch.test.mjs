import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// Mismo enfoque que el resto de pruebas de PosTerminal.js en este repo (ver
// PosTerminal.shiftGate.test.mjs / PosTerminal.printAgent.test.mjs): sin
// infraestructura de render de React (sin jsdom/testing-library), se
// verifica por contrato sobre el código fuente que SALIDA y "Vehículos en
// el parking" quedan realmente separados, y que la búsqueda por patente
// reutiliza la normalización/alcance existentes en vez de una lógica
// paralela.

const terminalSource = await readFile(new URL("./PosTerminal.js", import.meta.url), "utf8");

function slice(startMarker, endMarker) {
  const start = terminalSource.indexOf(startMarker);
  assert.ok(start > -1, `no se encontró el marcador de inicio: ${startMarker}`);
  const end = terminalSource.indexOf(endMarker, start);
  assert.ok(end > start, `no se encontró el marcador de fin: ${endMarker}`);
  return terminalSource.slice(start, end);
}

test("A: SALIDA no lista automáticamente todas las permanencias — su rama de render no llama a renderVehiclesPreparedList", () => {
  const salidaBranch = slice(
    'if (currentView === POS_VIEWS.SALIDA) {',
    '// VEHÍCULOS EN EL PARKING: vista de consulta',
  );
  assert.doesNotMatch(salidaBranch, /renderVehiclesPreparedList\(\)/);
  assert.match(salidaBranch, /BUSCAR/);
  assert.match(salidaBranch, /searchSalidaPlate/);
});

test("F: VEHÍCULOS EN EL PARKING sigue siendo una rama separada que sí usa el listado completo", () => {
  const vehiculosBranch = slice(
    "if (currentView === POS_VIEWS.VEHICULOS) {",
    "if (currentView === POS_VIEWS.QR)",
  );
  assert.match(vehiculosBranch, /renderVehiclesPreparedList\(\)/);
  assert.doesNotMatch(vehiculosBranch, /searchSalidaPlate/);
});

test("normalización de patente: searchSalidaPlate reutiliza formatPosPlateInput/toBackendPlate/POS_PLATE_REGEX existentes, sin lógica paralela", () => {
  const fn = slice("function searchSalidaPlate() {", "async function openVehicleDetail(stay) {");
  assert.match(fn, /formatPosPlateInput\(salidaPlate\)/);
  assert.match(fn, /POS_PLATE_REGEX\.test\(formatted\)/);
  assert.match(fn, /toBackendPlate\(formatted\)/);
  assert.match(fn, /toBackendPlate\(stay\?\.license_plate\)/);
});

test("B/D/G: la búsqueda filtra exclusivamente activeStays (ya acotado al parking asignado del operador) — no hay una API/fetch nueva", () => {
  const fn = slice("function searchSalidaPlate() {", "async function openVehicleDetail(stay) {");
  assert.match(fn, /activeStays\.filter\(/);
  assert.doesNotMatch(fn, /fetch\(/);
});

test("B: exactamente una coincidencia abre directamente el detalle de esa única permanencia (openVehicleDetail(matches[0]))", () => {
  const fn = slice("function searchSalidaPlate() {", "async function openVehicleDetail(stay) {");
  assert.match(fn, /matches\.length === 0/);
  assert.match(fn, /matches\.length > 1/);
  assert.match(fn, /void openVehicleDetail\(matches\[0\]\);/);
});

test("C: patente inexistente muestra el mensaje exacto pedido, sin abrir ningún detalle", () => {
  const fn = slice("function searchSalidaPlate() {", "async function openVehicleDetail(stay) {");
  assert.match(fn, /No se encontró un vehículo activo con esa patente en este estacionamiento\./);
});

test("E: múltiples permanencias OPEN con la misma patente nunca eligen una en silencio ni cobran automáticamente", () => {
  const fn = slice("function searchSalidaPlate() {", "async function openVehicleDetail(stay) {");
  const conflictBranch = fn.slice(fn.indexOf("matches.length > 1"), fn.indexOf("setSalidaSearchStatus(null);"));
  assert.doesNotMatch(conflictBranch, /openVehicleDetail/);
  assert.match(conflictBranch, /type: "conflict"/);
});

test("G/H: SALIDA sigue exigiendo turno OPEN vía renderShiftGate antes del formulario de búsqueda", () => {
  const salidaBranch = slice(
    'if (currentView === POS_VIEWS.SALIDA) {',
    '// VEHÍCULOS EN EL PARKING: vista de consulta',
  );
  assert.match(salidaBranch, /const gate = renderShiftGate\("Salida de vehículo"\);/);
  assert.match(salidaBranch, /if \(gate\) return gate;/);
});

test("VEHÍCULOS EN EL PARKING no exige turno (sigue siendo de solo lectura)", () => {
  const vehiculosBranch = slice(
    "if (currentView === POS_VIEWS.VEHICULOS) {",
    "if (currentView === POS_VIEWS.QR)",
  );
  assert.doesNotMatch(vehiculosBranch, /renderShiftGate/);
});

test("no se modificó la lógica server-side de turnos ni el flujo EXIT existente", () => {
  assert.doesNotMatch(terminalSource, /pos_shifts/);
});

// Desplegable de sugerencias en vivo (pedido posterior a la separación
// SALIDA/VEHÍCULOS): a medida que se escribe la patente, se muestra y se va
// acotando una lista de las permanencias abiertas que calzan con lo
// escrito, reutilizando la misma fuente de datos (activeStays) y la misma
// normalización (toBackendPlate), sin ninguna llamada de red nueva.
test("salidaSuggestions filtra activeStays con startsWith sobre la patente normalizada, sin fetch nuevo, y vacío sin texto", () => {
  const block = slice(
    "const salidaSuggestions = (() => {",
    "function selectSalidaSuggestion(stay) {",
  );
  assert.match(block, /toBackendPlate\(salidaPlate\)/);
  assert.match(block, /if \(!query\) return \[\];/);
  assert.match(block, /activeStays\s*\n\s*\.filter\(\(stay\) => toBackendPlate\(stay\?\.license_plate\)\.startsWith\(query\)\)/);
  assert.doesNotMatch(block, /fetch\(/);
});

test("selectSalidaSuggestion completa la patente, cierra el desplegable y abre el detalle de esa permanencia directamente", () => {
  const fn = slice("function selectSalidaSuggestion(stay) {", "async function openVehicleDetail(stay) {");
  assert.match(fn, /setSalidaPlate\(formatPosPlateInput\(stay\?\.license_plate\)\);/);
  assert.match(fn, /setSalidaSuggestionsOpen\(false\);/);
  assert.match(fn, /void openVehicleDetail\(stay\);/);
});

test("el input de SALIDA abre/cierra el desplegable al escribir y ofrece una lista clicable de sugerencias", () => {
  const salidaBranch = slice(
    'if (currentView === POS_VIEWS.SALIDA) {',
    '// VEHÍCULOS EN EL PARKING: vista de consulta',
  );
  assert.match(salidaBranch, /setSalidaSuggestionsOpen\(Boolean\(formatted\)\);/);
  assert.match(salidaBranch, /salidaSuggestionsOpen && salidaSuggestions\.length > 0/);
  assert.match(salidaBranch, /onClick=\{\(\) => selectSalidaSuggestion\(stay\)\}/);
  assert.match(salidaBranch, /salidaSuggestions\.map\(\(stay, index\) =>/);
});

test("cambiar de vista fuera de SALIDA cierra el desplegable (goToSection)", () => {
  const fn = slice("function goToSection(section) {", "if (section === POS_VIEWS.CIERRE_CAJA)");
  assert.match(fn, /setSalidaSuggestionsOpen\(false\);/);
});
