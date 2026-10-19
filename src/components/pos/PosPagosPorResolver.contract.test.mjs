import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// QA PRO2 2026-10-18 (SOL-2026-10-11-001): con varios pagos por resolver la lista ocupaba el
// inicio. INICIO muestra una alerta de una línea; la lista vive en «Pagos por resolver» (menú).
const terminal = readFileSync(new URL("./PosTerminal.js", import.meta.url), "utf8");
const pending = readFileSync(new URL("./PosTuuPendingPayments.js", import.meta.url), "utf8");

test("INICIO muestra solo la alerta compacta y abre la pantalla de pagos por resolver", () => {
  assert.match(terminal, /<TuuPendingPaymentsAlert count=\{tuuPendingViews\.length\} onOpen=\{\(\) => goToSection\(POS_VIEWS\.PAGOS_POR_RESOLVER\)\} \/>/);
  const home = terminal.slice(terminal.indexOf('className="pos-home-panel'), terminal.indexOf('className="pos-home-actions'));
  assert.doesNotMatch(home, /<TuuPendingPaymentsBanner/);
  assert.doesNotMatch(home, /<TuuPendingPaymentCard/);
});

test("el menú agrega «PAGOS POR RESOLVER (n)» destacado solo cuando hay pendientes", () => {
  assert.match(terminal, /\.\.\.\(tuuPendingViews\.length \? \[\{ label: `PAGOS POR RESOLVER \(\$\{tuuPendingViews\.length\}\)`, alert: true, onSelect: \(\) => goToSection\(POS_VIEWS\.PAGOS_POR_RESOLVER\) \}\] : \[\]\)/);
  assert.equal((terminal.match(/className=\{item\.alert \? /g) || []).length, 2);
});

test("la pantalla «Pagos por resolver» lista los pagos, abre el detalle y vuelve al inicio", () => {
  assert.match(terminal, /PAGOS_POR_RESOLVER: "PAGOS_POR_RESOLVER"/);
  assert.match(terminal, /if \(currentView === POS_VIEWS\.PAGOS_POR_RESOLVER\) \{\s*return renderPagosPorResolverPanel\(\);/);
  const panel = terminal.slice(terminal.indexOf("function renderPagosPorResolverPanel"), terminal.indexOf("function renderOperationalPanel"));
  assert.match(panel, /<TuuPendingPaymentsBanner records=\{tuuPendingViews\}/);
  assert.match(panel, /<TuuPendingPaymentCard/);
  assert.match(panel, /VOLVER AL INICIO/);
  assert.match(terminal, /if \(section === POS_VIEWS\.PAGOS_POR_RESOLVER\) \{\s*setTuuPendingViewStayId\(null\);/);
});

test("la alerta es de una línea y se oculta sin pendientes", () => {
  assert.match(pending, /export function TuuPendingPaymentsAlert\(\{ count, onOpen \}\)/);
  assert.match(pending, /if \(total <= 0\) return null;/);
  assert.match(pending, /pagos con tarjeta por resolver/);
});
