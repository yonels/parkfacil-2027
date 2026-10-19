import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { couponAvailableForCharge, couponTokenForRequest, isCouponQrPayload, parseCouponInput } from "../cupones/couponInput.mjs";
import { couponBenefitText, couponViewFromQuote, receiptCouponLine, COUPON_IN_TICKET_SCAN_MESSAGE } from "./posCoupon.mjs";
import { getCoupon } from "../parkingStayQuoteService.js";

const UUID = "3f2b8c1e-9d4a-4e7b-8c2d-1a2b3c4d5e6f";

test("parses the coupon QR payload and the printed code (with or without dash/prefix)", () => {
  assert.deepEqual(parseCouponInput(`PFC-COUPON:${UUID}`), { kind: "token", value: UUID });
  assert.deepEqual(parseCouponInput(" pfc-coupon:" + UUID + " "), { kind: "token", value: UUID });
  assert.deepEqual(parseCouponInput("PF-0B5B9CF2"), { kind: "code", value: "PF-0B5B9CF2" });
  assert.deepEqual(parseCouponInput("pf-0b5b9cf2"), { kind: "code", value: "PF-0B5B9CF2" });
  assert.deepEqual(parseCouponInput("PF0B5B9CF2"), { kind: "code", value: "PF-0B5B9CF2" });
  assert.deepEqual(parseCouponInput("0B5B9CF2"), { kind: "code", value: "PF-0B5B9CF2" });
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
  assert.equal(couponTokenForRequest("nada"), null);
  assert.match(COUPON_IN_TICKET_SCAN_MESSAGE, /APLICAR CUPÓN/);
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
});

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("POS quote route: POST recalculates with the coupon, refused where coupons are off and for released stays", () => {
  const source = read("../../app/api/pos/stays/[stayId]/quote/route.js");
  const post = source.slice(source.indexOf("export async function POST"), source.indexOf("async function quoteStay"));
  assert.ok(post.indexOf("couponsEnabled()") < post.indexOf("request.json()"));
  assert.match(post, /status: 403/);
  assert.match(source, /RELEASED_PAYMENT_NO_COUPON/);
  assert.match(source, /quoteOpenPosStay\(authorization\.db, parking\.id, stayId, \{ now: new Date\(\), \.\.\.\(couponToken \? \{ couponToken \} : \{\}\) \}\)/);
  assert.match(read("../posStaysService.js"), /\.\.\.\(options\.couponToken \? \{ couponToken: options\.couponToken \} : \{\}\)/);
  assert.match(read("../../app/api/pos/stays/route.js"), /couponsEnabled: couponsEnabled\(\)/);
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

test("POS terminal: APLICAR CUPÓN in the payment window, scanner + manual code, coupon kept on refresh and sent on cash exit", () => {
  const source = read("../../components/pos/PosTerminal.js");
  assert.match(source, /APLICAR CUPÓN/);
  assert.match(source, /ESCANEAR QR DEL CUPÓN/);
  assert.match(source, /QUITAR CUPÓN/);
  assert.match(source, /placeholder="PF-XXXXXXXX"/);
  assert.match(source, /const couponControlsVisible = couponsEnabled && quoteView\?\.payable && !quote\?\.released && paymentStep === "MENU";/);
  assert.match(source, /setCouponsEnabled\(summary\.payload\?\.data\?\.couponsEnabled === true\)/);
  assert.match(source, /getPosVehicleQuote\(selectedVehicle\.stay\.id, appliedCouponToken\)/);
  assert.match(source, /couponToken: appliedCouponToken/);
  assert.match(source, /coupon: receiptCouponLine\(stay, quote\)/);
  const qrTicket = source.slice(source.indexOf("async function handleQrTicket"), source.indexOf("async function handleQrTicket") + 400);
  assert.match(qrTicket, /isCouponQrPayload\(raw\)/);
});
