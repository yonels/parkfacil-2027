import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { couponAvailableForCharge, couponTokenForRequest, isCouponQrPayload, parseCouponInput } from "../cupones/couponInput.mjs";
import { classifyDiscountScan, couponBenefitText, couponViewFromQuote, discountScanFailureMessage, DISCOUNT_SCAN_MESSAGES, isZeroTotalCouponCharge, receiptCouponLine, COUPON_IN_TICKET_SCAN_MESSAGE } from "./posCoupon.mjs";
import { getCoupon } from "../parkingStayQuoteService.js";

const UUID = "3f2b8c1e-9d4a-4e7b-8c2d-1a2b3c4d5e6f";

test("parses the coupon QR payload and the printed code (with or without dash/prefix)", () => {
  assert.deepEqual(parseCouponInput(`PFC-COUPON:${UUID}`), { kind: "token", value: UUID });
  assert.deepEqual(parseCouponInput(" pfc-coupon:" + UUID + " "), { kind: "token", value: UUID });
  assert.deepEqual(parseCouponInput("PF-0B5B9CF2"), { kind: "code", value: "PF-0B5B9CF2" });
  assert.deepEqual(parseCouponInput("pf-0b5b9cf2"), { kind: "code", value: "PF-0B5B9CF2" });
  assert.deepEqual(parseCouponInput("PF0B5B9CF2"), { kind: "code", value: "PF-0B5B9CF2" });
  assert.deepEqual(parseCouponInput("0B5B9CF2"), { kind: "code", value: "PF-0B5B9CF2" });
  // Código corto de 4 caracteres (sin 0/O/1/I/L).
  assert.deepEqual(parseCouponInput("k7m2"), { kind: "code", value: "K7M2" });
  assert.deepEqual(parseCouponInput(" K7 M2 "), { kind: "code", value: "K7M2" });
  assert.equal(parseCouponInput("K0M2"), null, "0 no forma parte del alfabeto");
  assert.equal(parseCouponInput("K7M"), null);
  assert.equal(parseCouponInput(""), null);
  assert.equal(parseCouponInput("PF-XYZ"), null);
  assert.equal(parseCouponInput("PFC-TICKET:abc"), null);
  assert.equal(parseCouponInput("PFC-COUPON:"), null);
});

test("ticket QR screen recognizes a coupon QR; request token keeps the kind", () => {
  assert.equal(isCouponQrPayload(`PFC-COUPON:${UUID}`), true);
  assert.equal(isCouponQrPayload("PF-0B5B9CF2"), false);
  assert.equal(isCouponQrPayload("TCK-123"), false);
  assert.equal(couponTokenForRequest(`PFC-COUPON:${UUID}`), `PFC-COUPON:${UUID}`);
  assert.equal(couponTokenForRequest("0b5b9cf2"), "PF-0B5B9CF2");
  assert.equal(couponTokenForRequest("no es cupón"), null);
  assert.equal(couponTokenForRequest("k7m2"), "K7M2");
  assert.match(COUPON_IN_TICKET_SCAN_MESSAGE, /Leer QR Descuento/);
});

test("card charge pre-check: only active, unredeemed and unexpired coupons", () => {
  const now = Date.parse("2026-10-19T12:00:00Z");
  const ok = { status: "ACTIVE", redeemed_at: null, expires_at: "2026-10-20T00:00:00Z" };
  assert.equal(couponAvailableForCharge(ok, now), true);
  assert.equal(couponAvailableForCharge({ ...ok, status: "REDEEMED" }, now), false);
  assert.equal(couponAvailableForCharge({ ...ok, redeemed_at: "2026-10-19T11:00:00Z" }, now), false);
  assert.equal(couponAvailableForCharge({ ...ok, expires_at: "2026-10-19T11:59:59Z" }, now), false);
  assert.equal(couponAvailableForCharge(null, now), false);
});

test("benefit text and payment window view come from the signed quote", () => {
  assert.equal(couponBenefitText("PERCENTAGE", 20), "20% de descuento");
  assert.equal(couponBenefitText("FIXED_AMOUNT", 1500), "$1.500 de descuento");
  assert.equal(couponBenefitText("FREE_MINUTES", 15), "15 minutos gratis");
  assert.equal(couponViewFromQuote({ snapshot: { couponId: null } }), null);
  assert.deepEqual(couponViewFromQuote({ snapshot: { couponId: "c1", couponCode: "PF-0B5B9CF2", couponBenefitType: "PERCENTAGE", couponBenefitValue: 20, subtotalAmount: 2000, discountAmount: 400 } }), { code: "PF-0B5B9CF2", benefit: "20% de descuento", subtotal: 2000, discount: 400 });
});

test("receipt coupon line uses the paid stay first and is null without coupon", () => {
  const quote = { snapshot: { couponCode: "PF-0B5B9CF2", couponBenefitType: "PERCENTAGE", couponBenefitValue: 20, subtotalAmount: 1, discountAmount: 1 } };
  assert.deepEqual(receiptCouponLine({ coupon_code: "PF-0B5B9CF2", subtotal_amount: 2000, discount_amount: 400 }, quote), { code: "PF-0B5B9CF2", benefit: "20% de descuento", subtotalAmount: 2000, discountAmount: 400 });
  assert.deepEqual(receiptCouponLine({}, quote), { code: "PF-0B5B9CF2", benefit: "20% de descuento", subtotalAmount: 1, discountAmount: 1 });
  assert.equal(receiptCouponLine({ coupon_code: null }, { snapshot: {} }), null);
});

function fakeCouponDb(row) {
  const calls = [];
  const builder = {
    select() { return builder; },
    eq(column, value) { calls.push([column, value]); return builder; },
    async maybeSingle() { return { data: row, error: null }; },
  };
  return { calls, db: { from(table) { assert.equal(table, "coupons"); return builder; } } };
}

const validRow = { id: "c1", company_id: "emp-ramis", status: "ACTIVE", redeemed_at: null, valid_from: "2020-01-01T00:00:00Z", expires_at: "2999-01-01T00:00:00Z" };

test("getCoupon looks up the QR token, or the printed code only inside the company", async () => {
  const byToken = fakeCouponDb(validRow);
  assert.equal((await getCoupon(byToken.db, `PFC-COUPON:${UUID}`, "emp-ramis")).id, "c1");
  assert.deepEqual(byToken.calls, [["qr_token", UUID]]);
  const byCode = fakeCouponDb(validRow);
  assert.equal((await getCoupon(byCode.db, "pf-0b5b9cf2", "emp-ramis")).id, "c1");
  assert.deepEqual(byCode.calls, [["code", "PF-0B5B9CF2"], ["company_id", "emp-ramis"]]);
});

test("getCoupon keeps the existing validations", async () => {
  await assert.rejects(getCoupon(fakeCouponDb(null).db, "PF-0B5B9CF2", "emp-ramis"), /COUPON_NOT_FOUND/);
  await assert.rejects(getCoupon(fakeCouponDb(validRow).db, "texto", "emp-ramis"), /COUPON_NOT_FOUND/);
  await assert.rejects(getCoupon(fakeCouponDb({ ...validRow, status: "REDEEMED" }).db, "PF-0B5B9CF2", "emp-ramis"), /COUPON_ALREADY_USED/);
  await assert.rejects(getCoupon(fakeCouponDb({ ...validRow, company_id: "emp-5q" }).db, `PFC-COUPON:${UUID}`, "emp-ramis"), /COUPON_WRONG_COMPANY/);
  await assert.rejects(getCoupon(fakeCouponDb({ ...validRow, expires_at: "2000-01-01T00:00:00Z" }).db, "PF-0B5B9CF2", "emp-ramis"), /COUPON_EXPIRED/);
  await assert.rejects(getCoupon(fakeCouponDb({ ...validRow, valid_from: "2999-01-01T00:00:00Z" }).db, "PF-0B5B9CF2", "emp-ramis"), /COUPON_NOT_YET_VALID/);
  assert.equal(await getCoupon(fakeCouponDb(validRow).db, null, "emp-ramis"), null);
  // Inactivo (borrador o anulado) no es "ya utilizado"; de otra empresa no revela su estado.
  await assert.rejects(getCoupon(fakeCouponDb({ ...validRow, status: "CANCELLED" }).db, "PF-0B5B9CF2", "emp-ramis"), /COUPON_INACTIVE/);
  await assert.rejects(getCoupon(fakeCouponDb({ ...validRow, status: "DRAFT" }).db, "PF-0B5B9CF2", "emp-ramis"), /COUPON_INACTIVE/);
  await assert.rejects(getCoupon(fakeCouponDb({ ...validRow, status: "EXPIRED" }).db, "PF-0B5B9CF2", "emp-ramis"), /COUPON_EXPIRED/);
  await assert.rejects(getCoupon(fakeCouponDb({ ...validRow, status: "REDEEMED", company_id: "emp-5q" }).db, `PFC-COUPON:${UUID}`, "emp-ramis"), /COUPON_WRONG_COMPANY/);
});

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("POS quote route: POST recalculates with the coupon, refused where coupons are off and for released stays", () => {
  const source = read("../../app/api/pos/stays/[stayId]/quote/route.js");
  const post = source.slice(source.indexOf("export async function POST"), source.indexOf("async function quoteStay"));
  assert.ok(post.indexOf("couponsEnabled()") < post.indexOf("request.json()"));
  assert.match(post, /status: 403/);
  assert.match(source, /RELEASED_PAYMENT_NO_COUPON/);
  // Etapa C: además el módulo activo de la empresa del estacionamiento.
  assert.match(source, /couponToken && !\(await couponsActiveForParking\(authorization\.db, parking\.id\)\)/);
  assert.match(source, /quoteOpenPosStay\(authorization\.db, parking\.id, stayId, \{ now: new Date\(\), \.\.\.\(couponToken \? \{ couponToken \} : \{\}\) \}\)/);
  assert.match(read("../posStaysService.js"), /\.\.\.\(options\.couponToken \? \{ couponToken: options\.couponToken \} : \{\}\)/);
  assert.match(read("../../app/api/pos/stays/route.js"), /couponsEnabled: await couponsActiveForParking\(authorization\.db, parking\.id\)/);
});

test("data-entry refuses coupons where disabled and re-checks the coupon before a card charge", () => {
  const source = read("../../app/api/data-entry/route.js");
  assert.match(source, /if \(input\.couponToken && !couponsEnabled\(\)\) return fail\(COUPONS_DISABLED_ERROR\.error, 403/);
  // La reserva de pagos con tarjeta (TUU-02) no existe en todas las ramas.
  if (!source.includes('if (input.action === "CARD_PAYMENT_RESERVE")')) return;
  const reserve = source.slice(source.indexOf('if (input.action === "CARD_PAYMENT_RESERVE")'), source.indexOf("reserveCardPaymentAttempt(current.db"));
  assert.match(reserve, /input\.quoteSnapshot\.couponId/);
  assert.match(reserve, /couponAvailableForCharge\(couponRow\)/);
  assert.match(reserve, /COUPON_UNAVAILABLE/);
});

test("POS terminal: Leer QR Descuento (detail above PAGAR and payment window), scanner + manual code, coupon kept on refresh and sent on cash exit", () => {
  const source = read("../../components/pos/PosTerminal.js");
  assert.match(source, /<QrCode className="h-5 w-5" aria-hidden="true" \/>\}\s*Leer QR Descuento/);
  assert.match(source, /scanQrWithNativeScanner\(window, \{ purpose: "coupon" \}\)/);
  assert.match(source, /QUITAR CUPÓN/);
  assert.match(source, /placeholder="Código \(4 caracteres\)"/);
  assert.match(source, /const couponControlsVisible = couponsEnabled && quoteView\?\.payable && !quote\?\.released && paymentStep === "MENU";/);
  assert.match(source, /setCouponsEnabled\(summary\.payload\?\.data\?\.couponsEnabled === true\)/);
  assert.match(source, /getPosVehicleQuote\(selectedVehicle\.stay\.id, appliedCouponToken\)/);
  assert.match(source, /couponToken: appliedCouponToken/);
  assert.match(source, /coupon: receiptCouponLine\(stay, quote\)/);
  const qrTicket = source.slice(source.indexOf("async function handleQrTicket"), source.indexOf("async function handleQrTicket") + 400);
  assert.match(qrTicket, /isCouponQrPayload\(raw\)/);
  // Detalle del vehículo: el panel queda inmediatamente encima de PAGAR y PAGAR se bloquea mientras se valida.
  assert.match(source, /\{detailCouponVisible \? renderCouponPanel\(couponView\) : null\}\s*<button\s+type="button"\s+onClick=\{openPaymentModal\}\s+disabled=\{selectedVehicleLoading \|\| !hasPayableQuote \|\| couponBusy\}/);
  assert.match(source, /\{couponControlsVisible && !tuuPendingForStay \? renderCouponPanel\(couponView\) : null\}/);
});

test("POS terminal: late coupon or detail responses of another stay are ignored; one coupon request at a time", () => {
  const source = read("../../components/pos/PosTerminal.js");
  const run = source.slice(source.indexOf("async function runCouponRequest"), source.indexOf("async function quoteWithCoupon"));
  assert.match(run, /if \(!stayId \|\| couponLockRef\.current\) return;/);
  assert.match(run, /couponRequestRef\.current === requestId && selectedStayIdRef\.current === stayId/);
  const quote = source.slice(source.indexOf("async function quoteWithCoupon"), source.indexOf("function applyCouponCode"));
  assert.ok(quote.indexOf("if (!isCurrent()) return;") < quote.indexOf("setSelectedVehicle(response.payload.data)"));
  const reset = source.slice(source.indexOf("function resetCouponEntry"), source.indexOf("async function runCouponRequest"));
  assert.match(reset, /couponRequestRef\.current \+= 1;/);
  const detail = source.slice(source.indexOf("async function openVehicleDetail"), source.indexOf("async function handleQrTicket"));
  assert.match(detail, /if \(!stillSelected\(\)\) return null;/);
});

test("POS terminal: total $0 by coupon is an explicit no-charge exit, never sent to TUU", () => {
  const source = read("../../components/pos/PosTerminal.js");
  assert.match(source, /SALIDA SIN CARGO \(CUPÓN\)/);
  assert.match(source, /CONFIRMAR SALIDA SIN CARGO/);
  const card = source.slice(source.indexOf("async function handleCardPaymentSelection"), source.indexOf("async function handleCardPaymentSelection") + 600);
  assert.match(card, /if \(isZeroTotalCouponCharge\(selectedVehicle\?\.quote\)\) return;/);
  assert.match(source, /paymentStep === "MENU" && !tuuPendingForStay && !zeroTotalCoupon \?/);
});

test("receipt prints as soon as the payment is confirmed; terminal refresh runs in parallel (cash and card)", () => {
  const source = readFileSync(new URL("../../components/pos/PosTerminal.js", import.meta.url), "utf8");
  // Efectivo: imprime sin esperar la recarga. Tarjeta: igual, o usa la impresión ya iniciada al aprobar TUU.
  const cash = /const terminalRefresh = loadTerminalState\(true\);\r?\n\s*const printResult = receiptPayload \? await printLastReceipt\(receiptPayload\) : null;\r?\n\s*await terminalRefresh;/g;
  const card = /const terminalRefresh = loadTerminalState\(true\);\r?\n\s*if \(!earlyPrint\) setReceiptPrintStatus\(""\);\r?\n\s*const printResult = earlyPrint \? await earlyPrint : receiptPayload \? await printLastReceipt\(receiptPayload\) : null;\r?\n\s*await terminalRefresh;/g;
  assert.equal((source.match(cash) || []).length, 1);
  assert.equal((source.match(card) || []).length, 1);
  assert.doesNotMatch(source, /await loadTerminalState\(true\);\r?\n\r?\n\s*const printResult = receiptPayload/);
});

test("Leer QR Descuento: distingue cupón, ticket y QR ajeno", () => {
  assert.deepEqual(classifyDiscountScan(`PFC-COUPON:${UUID}`), { kind: "coupon", token: `PFC-COUPON:${UUID}` });
  assert.deepEqual(classifyDiscountScan(UUID), { kind: "ticket" });
  assert.deepEqual(classifyDiscountScan(`https://pos.parkfacilapp.cl/t/${UUID}`), { kind: "ticket" });
  assert.deepEqual(classifyDiscountScan("https://example.com/promo"), { kind: "foreign" });
  // Un QR con 4 caracteres no es un cupón: el código corto solo se escribe a mano.
  assert.deepEqual(classifyDiscountScan("K7M2"), { kind: "foreign" });
  assert.deepEqual(classifyDiscountScan("PFC-COUPON:"), { kind: "foreign" });
  assert.deepEqual(classifyDiscountScan(""), { kind: "foreign" });
});

test("mensajes del escáner: cancelado, permiso denegado y cámara no disponible", () => {
  assert.deepEqual(discountScanFailureMessage({ ok: false, cancelled: true }), { type: "info", text: DISCOUNT_SCAN_MESSAGES.cancelled });
  assert.deepEqual(discountScanFailureMessage({ ok: false, permissionDenied: true }), { type: "error", text: DISCOUNT_SCAN_MESSAGES.permissionDenied });
  assert.deepEqual(discountScanFailureMessage({ ok: false, error: "launch_failed" }), { type: "error", text: DISCOUNT_SCAN_MESSAGES.unavailable });
});

test("total $0 solo por cupón firmado", () => {
  assert.equal(isZeroTotalCouponCharge({ snapshot: { couponId: "c1", totalAmount: 0 } }), true);
  assert.equal(isZeroTotalCouponCharge({ snapshot: { couponId: "c1", totalAmount: 500 } }), false);
  assert.equal(isZeroTotalCouponCharge({ snapshot: { couponId: null, totalAmount: 0 } }), false);
  assert.equal(isZeroTotalCouponCharge(null), false);
});

test("POS quote with a coupon never creates a Webpay quote (total $0 by coupon used to fail with INVALID_QUOTE_BREAKDOWN)", () => {
  const source = read("../parkingStayQuoteService.js");
  assert.match(source, /if \(publicQuote\.payable && !quote\.coupon && process\.env\.WEBPAY_QUOTE_HMAC_SECRET\) \{/);
});
