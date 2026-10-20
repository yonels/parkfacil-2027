import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { boletaForReceipt, shouldIssueCashBoleta } from "./cashBoletaCore.mjs";
import { extractTedFromXml, resolutionText } from "./openFacturaCore.mjs";

// Boleta electrónica en el pago en efectivo del POS (SOL-2026-10-20-001).
const P1 = "11111111-1111-4111-8111-111111111111";
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const paid = { id: "s1", status: "PAID", payment_method: "CASH", total_amount: 14735, payment_code: "PAG-261020124629-E0A6", parking_id: P1 };
const settings = { api_key_ciphertext: "v1.x", enabled_parking_ids: [P1] };

test("boleta: solo pago en efectivo > $0 en estacionamiento activo con API Key", () => {
  assert.equal(shouldIssueCashBoleta({ stay: paid, settings }), true);
  assert.equal(shouldIssueCashBoleta({ stay: { ...paid, payment_method: "CARD" }, settings }), false, "tarjeta: voucher de TUU");
  assert.equal(shouldIssueCashBoleta({ stay: { ...paid, total_amount: 0 }, settings }), false, "cupón que cubre todo");
  assert.equal(shouldIssueCashBoleta({ stay: { ...paid, status: "OPEN" }, settings }), false);
  assert.equal(shouldIssueCashBoleta({ stay: paid, settings: { ...settings, enabled_parking_ids: [] } }), false);
  assert.equal(shouldIssueCashBoleta({ stay: paid, settings: { ...settings, api_key_ciphertext: null } }), false);
  assert.equal(shouldIssueCashBoleta({ stay: paid, settings: null }), false);
});

test("boleta: vista para el comprobante (emitida o pendiente), sin token", () => {
  const issued = boletaForReceipt({ status: "ISSUED", environment: "TEST", folio: 711226, ted: "<TED/>", stamp_png_base64: "iVBOR", resolution_date: "2022-09-07", resolution_number: 0, net_amount: 12382, tax_amount: 2353, total_amount: 14735, provider_token: "secreto" });
  assert.deepEqual(issued, { status: "ISSUED", environment: "TEST", folio: 711226, ted: "<TED/>", stampPngBase64: "iVBOR", resolution: "Res. N° 0 de 2022", netAmount: 12382, taxAmount: 2353, totalAmount: 14735 });
  const failed = boletaForReceipt({ status: "FAILED", environment: "TEST", error_code: "DTE_NETWORK" });
  assert.equal(failed.status, "FAILED");
  assert.match(failed.message, /pendiente/);
  assert.equal(boletaForReceipt(null), null);
  assert.equal(resolutionText({ date: null, number: 1 }), "");
});

test("boleta: TED del XML de OpenFactura (ISO-8859-1) sin la indentación entre etiquetas", () => {
  const xml = '<?xml version="1.0" encoding="ISO-8859-1"?><DTE><Documento>\n  <TED version="1.0">\n    <DD>\n      <RE>76795561-8</RE>\n      <IT1>Estacionamiento KJFF-59</IT1>\n    </DD>\n    <FRMT algoritmo="SHA1withRSA">abc\ndef</FRMT>\n  </TED>\n</Documento></DTE>';
  const ted = extractTedFromXml(Buffer.from(xml, "latin1").toString("base64"));
  assert.equal(ted, '<TED version="1.0"><DD><RE>76795561-8</RE><IT1>Estacionamiento KJFF-59</IT1></DD><FRMT algoritmo="SHA1withRSA">abc\ndef</FRMT></TED>');
  assert.equal(extractTedFromXml(null), null);
});

test("boleta: el registro del pago en efectivo del POS emite la boleta sin poder revertir el pago", () => {
  const route = read("../../app/api/data-entry/route.js");
  assert.match(route, /isPosRequest && input\.paymentMethod === "CASH" \? await issueCashPaymentBoleta\(current\.db, data\)\.catch\(\(\) => null\) : null/);
  const service = read("./cashBoletaService.js");
  assert.match(service, /status: "FAILED"/);
  assert.match(service, /paymentCode: stay\.payment_code/, "Idempotency-Key por código PAG: un reintento no duplica");
  assert.equal(/parking_stays"\)\.update/.test(service), false, "la boleta nunca modifica el pago");
  const pos = read("../../components/pos/PosTerminal.js");
  assert.match(pos, /buildPaymentReceiptPayload\(stay, quote, parkingResponse, "CASH", boleta\)/);
  assert.match(pos, /dteTed: boleta\.ted/);
  const migration = read("../../../supabase/migrations/20261020140000_cash_payment_boleta.sql");
  assert.match(migration, /revoke all on table public\.parking_stay_dte_documents from public, anon, authenticated/);
});
