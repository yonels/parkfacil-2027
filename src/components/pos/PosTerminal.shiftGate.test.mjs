import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// Estas pruebas siguen el mismo enfoque que ya usa el proyecto para
// PosTerminal.js (ver "la API y la UI POS quedan separadas de Webpay..."
// en posStaysService.test.mjs): no hay infraestructura de render de React
// en el repo (sin jsdom/testing-library), así que se verifica por contrato
// sobre el código fuente que el gate de turno cubre exactamente los
// estados y transiciones pedidos, y que la protección server-side
// (requireOpenPosShift) sigue intacta sin depender de la UI.

const terminalSource = await readFile(new URL("./PosTerminal.js", import.meta.url), "utf8");
const dataEntryRouteSource = await readFile(new URL("../../app/api/data-entry/route.js", import.meta.url), "utf8");

test("el turno se carga al montar el POS, no solo al entrar a Cierre de Caja", () => {
  assert.match(terminalSource, /void loadTerminalState\(false\);/);
  assert.match(terminalSource, /useEffect\(\(\) => \{[\s\S]{0,80}void loadShiftState\(\);/);
});

test("shiftReadyForOperations solo es verdadero con turno OPEN y no en CLOSING", () => {
  assert.match(
    terminalSource,
    /const shiftReadyForOperations = shiftState === "OPEN" && shift\?\.status !== "CLOSING";/,
  );
});

test("PROGRAMMED: gate bloquea, muestra el mensaje pedido y ofrece INICIAR TURNO vía startProgrammedShift", () => {
  assert.match(terminalSource, /Tienes un turno programado pendiente de inicio\./);
  assert.match(terminalSource, /onClick=\{\(\) => void startProgrammedShift\(\)\}/);
  assert.match(terminalSource, /\{shiftStartBusy \? "Iniciando\.\.\." : "INICIAR TURNO"\}/);
});

test("sin turno (UNASSIGNED con parking presente): gate bloquea con el mensaje pedido", () => {
  assert.match(terminalSource, /No tienes un turno programado para este estacionamiento\./);
});

test("CLOSING: gate bloquea con aviso de cierre en curso", () => {
  assert.match(
    terminalSource,
    /El turno está en proceso de cierre\. Espera a que se confirme el cierre de caja antes de continuar\./,
  );
});

test("OPEN (no CLOSING): renderShiftGate no bloquea (retorna null) y Home habilita los botones", () => {
  assert.match(terminalSource, /function renderShiftGate\(title, \{ hideVolver = false \} = \{\}\) \{\s*\n\s*if \(shiftReadyForOperations\) return null;/);
  assert.match(terminalSource, /disabled=\{!shiftReadyForOperations\}[\s\S]{0,40}aria-disabled=\{!shiftReadyForOperations\}[\s\S]{0,400}INGRESO/);
  assert.match(terminalSource, /disabled=\{!shiftReadyForOperations\}[\s\S]{0,40}aria-disabled=\{!shiftReadyForOperations\}[\s\S]{0,400}SALIDA/);
  assert.match(terminalSource, /Turno activo/);
});

test("HOME muestra el gate (con INICIAR TURNO cuando aplica) en vez de dejar sin ninguna opción de inicio", () => {
  // Este es el bug reportado: antes el gate solo vivía detrás de los
  // botones INGRESO/SALIDA, que quedaban deshabilitados — sin ningún
  // camino visible para iniciar un turno PROGRAMMED desde HOME.
  assert.match(
    terminalSource,
    /const homeShiftGate = renderShiftGate\("Inicio de turno", \{ hideVolver: true \}\);/,
  );
  assert.match(terminalSource, /\{homeShiftGate \? <div className="mb-4">\{homeShiftGate\}<\/div> : null\}/);
  // VEHÍCULOS EN EL PARKING y CÓDIGO QR no llevan `disabled` en HOME.
  const homePanel = terminalSource.slice(
    terminalSource.indexOf("function renderHomePanel() {"),
    terminalSource.indexOf("function renderIngresoPanel() {"),
  );
  assert.doesNotMatch(homePanel, /onClick=\{\(\) => goToSection\(POS_VIEWS\.VEHICULOS\)\}[\s\S]{0,120}disabled=/);
  assert.doesNotMatch(homePanel, /onClick=\{\(\) => goToSection\(POS_VIEWS\.QR\)\}[\s\S]{0,120}disabled=/);
});

test("startProgrammedShift refresca el turno y el estado del terminal sin exigir volver a iniciar sesión", () => {
  const fn = terminalSource.slice(
    terminalSource.indexOf("async function startProgrammedShift()"),
    terminalSource.indexOf("async function startProgrammedShift()") + 600,
  );
  // Camino de éxito: refresca turno + terminal, sin cerrar sesión ni
  // redirigir a login (el redirect a /pos/login solo existe para el caso
  // 401 dentro de "if (!result.ok)", no para un inicio exitoso).
  const successPath = fn.slice(fn.indexOf("await loadShiftState"));
  assert.match(fn, /await loadShiftState\(\);/);
  assert.match(fn, /await loadTerminalState\(true\);/);
  assert.doesNotMatch(successPath, /signOut|router\.replace\("\/pos\/login/);
});

// NOTA: SALIDA y VEHÍCULOS EN EL PARKING dejaron de compartir una sola
// rama de render (antes distinguidas por "isSalida") — ahora SALIDA es un
// buscador por patente independiente, y VEHÍCULOS EN EL PARKING sigue
// siendo el listado de solo lectura. Esa separación (y que el gate de
// turno solo aplique a SALIDA) queda cubierta en detalle por
// PosTerminal.salidaSearch.test.mjs; aquí solo se confirma que el gate de
// INGRESO sigue intacto y que SALIDA sigue llamando a renderShiftGate.
test("el gate se aplica a INGRESO y a la rama SALIDA, pero no a VEHÍCULOS EN EL PARKING", () => {
  assert.match(terminalSource, /function renderIngresoPanel\(\) \{[\s\S]{0,200}renderShiftGate\("Ingreso de vehículo"\)/);
  const salidaBranch = terminalSource.slice(
    terminalSource.indexOf("if (currentView === POS_VIEWS.SALIDA) {"),
    terminalSource.indexOf("if (currentView === POS_VIEWS.VEHICULOS) {"),
  );
  assert.match(salidaBranch, /const gate = renderShiftGate\("Salida de vehículo"\);/);
  const vehiculosBranch = terminalSource.slice(
    terminalSource.indexOf("if (currentView === POS_VIEWS.VEHICULOS) {"),
    terminalSource.indexOf("if (currentView === POS_VIEWS.QR)"),
  );
  assert.doesNotMatch(vehiculosBranch, /renderShiftGate/);
});

test("la confirmación de un ingreso ya registrado no queda oculta por el gate", () => {
  assert.match(terminalSource, /if \(!entrySuccess\) \{\s*\n\s*const gate = renderShiftGate\("Ingreso de vehículo"\);/);
});

test("la validación server-side requireOpenPosShift sigue intacta y rechaza ENTRY/EXIT sin turno OPEN", () => {
  assert.match(dataEntryRouteSource, /requireOpenPosShift\(current\.db, current\.actor\)/);
  assert.match(
    dataEntryRouteSource,
    /if \(isPosRequest && !posShift && \(input\.action === "ENTRY" \|\| input\.action === "EXIT"\)\) \{\s*\n\s*return fail\("Debes iniciar un turno antes de realizar esta operación en el POS\.", 409, \{ code: "OPEN_SHIFT_REQUIRED" \}\);/,
  );
});

test("no se creó ninguna tabla/servicio de turnos nuevo: el gate reutiliza operator_shifts vía loadShiftState/startProgrammedShift", () => {
  assert.doesNotMatch(terminalSource, /pos_shifts/);
  assert.match(terminalSource, /fetch\("\/api\/pos\/shift"/);
  assert.match(terminalSource, /fetch\("\/api\/pos\/shift\/start"/);
});
