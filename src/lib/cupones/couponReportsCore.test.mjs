import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { couponTotalsByShift, operationalIsoDate, summarizeCoupons, toCouponRedemptionRow } from "./couponReportsCore.mjs";
import { summarizeRevenueRows, toRevenueClosureRow, toRevenueTransactionRow } from "../offStreetRevenueCore.mjs";
import { REPORT_TABS, validateReportsFilters } from "../offStreetReportsCore.mjs";

test("operational date uses America/Santiago", () => {
  assert.equal(operationalIsoDate("2026-10-20T02:30:00Z"), "2026-10-19");
  assert.equal(operationalIsoDate("2026-10-19T16:56:07Z"), "2026-10-19");
  assert.equal(operationalIsoDate(null), null);
});

test("redemption row: one paid stay with its coupon", () => {
  const row = toCouponRedemptionRow(
    { id: "s1", code: "ING-1", license_plate: "HGRH-96", exit_at: "2026-10-19T16:56:07Z", exit_operator_name: "Ana", coupon_code: "PF-F86B2A9B", subtotal_amount: 75, discount_amount: 75, total_amount: 0, payment_method: "CASH" },
    { code: "PF-F86B2A9B", name: "Navidad", redeemingMerchantName: "Tienda de prueba QA", benefitType: "FREE_MINUTES", benefitValue: 15 },
    { parkingName: "Clínica Ramis", companyName: "Clínica Ramis" },
  );
  assert.deepEqual(row, { id: "s1", date: "19-10-2026", time: "13:56", ticket: "ING-1", plate: "HGRH-96", parkingName: "Clínica Ramis", companyName: "Clínica Ramis", operator: "Ana", couponCode: "PF-F86B2A9B", campaign: "Navidad", merchant: "Tienda de prueba QA", benefit: "15 minutos gratis", subtotalAmount: 75, discountAmount: 75, amount: 0, paymentMethod: "CASH" });
});

test("coupon totals per shift (cash closure)", () => {
  const totals = couponTotalsByShift([
    { payment_shift_id: "t1", coupon_id: "c1", discount_amount: 400 },
    { payment_shift_id: "t1", coupon_id: "c2", discount_amount: 75 },
    { payment_shift_id: "t2", coupon_id: "c3", discount_amount: 0 },
    { payment_shift_id: "t2", coupon_id: null, discount_amount: 999 },
  ]);
  assert.deepEqual(totals.get("t1"), { couponCount: 2, couponDiscountAmount: 475 });
  assert.deepEqual(totals.get("t2"), { couponCount: 1, couponDiscountAmount: 0 });
});

const coupons = [
  { id: "a", name: "Navidad", redeemingMerchantId: "m1", redeemingMerchantName: "Tienda A", createdAt: "2026-10-19T15:00:00Z", deliveredAt: "2026-10-19T15:10:00Z", redeemedAt: "2026-10-19T16:56:00Z", expiresAt: "2026-10-20T12:00:00Z" },
  { id: "b", name: "Navidad", redeemingMerchantId: "m1", redeemingMerchantName: "Tienda A", createdAt: "2026-10-19T15:00:00Z", deliveredAt: "2026-10-19T15:10:00Z", redeemedAt: null, expiresAt: "2026-10-20T12:00:00Z" },
  { id: "c", name: "Día de la madre", redeemingMerchantId: "m1", redeemingMerchantName: "Tienda A", createdAt: "2026-10-19T15:00:00Z", deliveredAt: null, redeemedAt: null, expiresAt: "2026-10-19T18:00:00Z" },
  { id: "d", name: "Navidad", redeemingMerchantId: "m2", redeemingMerchantName: "Tienda B", createdAt: "2026-09-10T15:00:00Z", deliveredAt: "2026-09-10T15:10:00Z", redeemedAt: "2026-10-05T12:00:00Z", expiresAt: "2026-12-01T12:00:00Z" },
  { id: "e", name: "Vieja", redeemingMerchantId: "m3", redeemingMerchantName: "Tienda C", createdAt: "2026-08-01T15:00:00Z", deliveredAt: null, redeemedAt: null, expiresAt: "2026-08-02T12:00:00Z" },
];
const discounts = new Map([["a", 75], ["d", 400]]);
const now = new Date("2026-10-19T20:00:00Z");

test("summary by store: issued, delivered, redeemed, expired unused, redemption rate and discount", () => {
  const rows = summarizeCoupons(coupons, discounts, { dateFrom: "2026-10-01", dateTo: "2026-10-31", groupBy: "merchant", now });
  assert.deepEqual(rows, [
    { key: "m1", merchant: "Tienda A", campaign: "", issued: 3, delivered: 2, redeemed: 1, expiredUnused: 1, discountAmount: 75, redemptionRate: 33.3 },
    { key: "m2", merchant: "Tienda B", campaign: "", issued: 0, delivered: 0, redeemed: 1, expiredUnused: 0, discountAmount: 400, redemptionRate: null },
  ]);
});

test("summary by campaign groups campaign + store", () => {
  const rows = summarizeCoupons(coupons, discounts, { dateFrom: "2026-10-19", dateTo: "2026-10-19", groupBy: "campaign", now });
  assert.deepEqual(rows.map((row) => [row.campaign, row.merchant, row.issued, row.redeemed, row.expiredUnused, row.redemptionRate]), [
    ["Navidad", "Tienda A", 2, 1, 0, 50],
    ["Día de la madre", "Tienda A", 1, 0, 1, 0],
  ]);
});

test("recaudación rows and summary carry coupon code and discount; closures carry coupon totals", () => {
  const row = toRevenueTransactionRow({ id: "s1", total_amount: 0, coupon_code: "PF-F86B2A9B", discount_amount: 75, payment_method: "CASH" });
  assert.equal(row.couponCode, "PF-F86B2A9B");
  assert.equal(row.discountAmount, 75);
  assert.equal(toRevenueTransactionRow({ id: "s2", total_amount: 1000 }).couponCode, "");
  const summary = summarizeRevenueRows([{ total_amount: 0, coupon_id: "c1", discount_amount: 75, payment_method: "CASH" }, { total_amount: 1000, payment_method: "CASH" }]);
  assert.equal(summary.couponCount, 1);
  assert.equal(summary.couponDiscountAmount, 75);
  const closure = toRevenueClosureRow({ id: "x", coupon_count: 2, coupon_discount_amount: 475 });
  assert.equal(closure.couponCount, 2);
  assert.equal(closure.couponDiscountAmount, 475);
  assert.equal(toRevenueClosureRow({ id: "y" }).couponCount, 0);
});

test("reports accept type coupons; route and page wire the Cupones tab behind the coupons switch", () => {
  assert.ok(REPORT_TABS.includes("coupons"));
  assert.equal(validateReportsFilters({ type: "coupons", dateFrom: "2026-10-01", dateTo: "2026-10-31" }).ok, true);
  const route = readFileSync(new URL("../../app/api/reportes-off-street/route.js", import.meta.url), "utf8");
  const block = route.slice(route.indexOf('if (type === "coupons")'), route.indexOf('if (type === "shifts")'));
  assert.ok(block.indexOf("couponsEnabled()") < block.indexOf("searchCouponRedemptions"));
  const page = readFileSync(new URL("../../app/reportes-off-street/page.js", import.meta.url), "utf8");
  assert.match(page, /\.\.\.\(couponsVisible\(\) \? \[\{ id: "cupones", label: "Cupones" \}\] : \[\]\)/);
  assert.match(page, /\["couponCode", "Cupón"\], \["discountAmount", "Descuento cupón"\], \["amount", "Monto"\]/);
  assert.match(page, /\["couponCount", "Cupones canjeados"\], \["couponDiscountAmount", "Descuento cupones"\]/);
  const service = readFileSync(new URL("../offStreetRevenueService.js", import.meta.url), "utf8");
  assert.match(service, /payment_shift_id,coupon_id,coupon_code,discount_amount"/);
  assert.match(service, /couponTotalsByShift\(data \|\| \[\]\)/);
});

test("coupons page shows the summary by store/campaign", () => {
  const client = readFileSync(new URL("../../components/cupones/CouponsClient.js", import.meta.url), "utf8");
  assert.match(client, /<CouponsSummary refreshKey=\{coupons\.length\}\/>/);
  const summary = readFileSync(new URL("../../components/cupones/CouponsSummary.js", import.meta.url), "utf8");
  assert.match(summary, /\/api\/cupones\/resumen\?/);
});
