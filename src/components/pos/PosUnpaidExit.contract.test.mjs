import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// SOL-2026-10-08-003: contrato de integración del POS (sin render de React,
// mismo enfoque que PosTerminal.tuuPayment.contract.test.mjs).
const terminal = await readFile(new URL("./PosTerminal.js", import.meta.url), "utf8");
const unpaid = await readFile(new URL("./PosUnpaidExit.js", import.meta.url), "utf8");

test("los botones de cobro existentes no cambian (EFECTIVO / DÉBITO / CRÉDITO)", () => {
  assert.match(terminal, /onClick=\{\(\) => handlePaymentSelection\("CASH"\)\}/);
  assert.match(terminal, /onClick=\{\(\) => void handleCardPaymentSelection\(TUU_METHOD\.DEBIT\)\}/);
  assert.match(terminal, /onClick=\{\(\) => void handleCardPaymentSelection\(TUU_METHOD\.CREDIT\)\}/);
});

test("SE RETIRÓ SIN PAGAR está en el detalle del vehículo y no depende de que la tarifa sea pagable", () => {
  const start = terminal.indexOf("function renderVehicleDetailPanel()");
  const end = terminal.indexOf("function renderPaymentModal()", start);
  const panel = terminal.slice(start, end);
  assert.match(panel, /<UnpaidExitAction/);
  const action = panel.slice(panel.indexOf("<UnpaidExitAction"), panel.indexOf("/>", panel.indexOf("onDone", panel.indexOf("<UnpaidExitAction"))));
  assert.match(action, /disabled=\{selectedVehicleLoading \|\| !stay\?\.id\}/);
  assert.doesNotMatch(action, /hasPayableQuote/);
});

test("la marca usa la acción UNPAID_EXIT del POS y revertir usa UNPAID_REVERT", () => {
  assert.match(unpaid, /action: "UNPAID_EXIT", stayId: stay\.id, notes/);
  assert.match(unpaid, /action: "UNPAID_REVERT", stayId: row\.stayId/);
  assert.match(unpaid, /"x-parkfacil-portal": "terminal"/);
  assert.match(unpaid, /if \(result\.status === 401\) \{ onSessionExpired\?\.\(\); return; \}/);
});

test("tras marcar, el POS vuelve a la lista y recarga vehículos y turno", () => {
  const start = terminal.indexOf("<UnpaidExitAction");
  const block = terminal.slice(start, terminal.indexOf("/>", terminal.indexOf("onDone", start)) + 2);
  assert.match(block, /setSelectedVehicle\(null\)/);
  assert.match(block, /goToSection\(vehicleListOrigin\)/);
  assert.match(block, /loadTerminalState\(true\)/);
  assert.match(block, /loadShiftState\(\)/);
});

test("el aviso de deuda se muestra en el ingreso registrado", () => {
  assert.match(terminal, /debtNotice: payload\?\.data\?\.debtNotice \|\| null/);
  assert.match(terminal, /<DebtNoticeBanner notice=\{entrySuccess\.debtNotice\} \/>/);
});

test("el cierre de turno muestra las salidas sin pago (en curso y cerradas)", () => {
  assert.match(terminal, /<UnpaidExitsReview\s+rows=\{preview\.unpaidExits\}/);
  assert.match(terminal, /setClosedUnpaidExits\(result\.payload\?\.data\?\.unpaidExits \|\| null\)/);
  assert.match(terminal, /<ClosedUnpaidExitsSummary summary=\{closedUnpaidExits\} \/>/);
});

test("el comprobante agrega el resumen de franjas sin cambiar el formato impreso", () => {
  assert.match(terminal, /summarizeChargeBreakdown\(quote\?\.snapshot\?\.chargeBreakdown\)/);
  assert.match(terminal, /rateDescription: \[/);
});

test("el detalle por franja solo se muestra con una cotización pagable", () => {
  assert.match(terminal, /<ChargeBreakdownList breakdown=\{hasPayableQuote \? quote\?\.snapshot\?\.chargeBreakdown : null\} \/>/);
});
