import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { couponBenefitLabel, couponPrintDocument, printHtmlInFrame } from "./couponPrint.mjs";

const coupon = { id: "c1", code: "PF-FE440550", name: "Navidad <b>", companyName: "Clínica Ramis", redeemingMerchantName: "Tienda de prueba QA", benefitType: "FREE_MINUTES", value: 15, expiresAt: "2026-10-20T12:23:00Z" };

function fakeDocument({ printOpensDialog = true, printThrows = false, noWindow = false } = {}) {
  const calls = { print: 0, removed: 0, appended: 0 };
  const listeners = {};
  const view = {
    addEventListener: (name, fn) => { listeners[name] = fn; },
    focus() {},
    print() { calls.print += 1; if (printThrows) throw new Error("blocked"); if (printOpensDialog) listeners.beforeprint?.(); },
  };
  const frame = {
    style: {}, attrs: {},
    setAttribute(name, value) { this.attrs[name] = value; },
    get contentWindow() { return noWindow ? null : view; },
    remove() { calls.removed += 1; },
    set srcdoc(value) { this._srcdoc = value; },
    get srcdoc() { return this._srcdoc; },
  };
  const doc = {
    createElement: (tag) => { assert.equal(tag, "iframe"); return frame; },
    body: { appendChild: (node) => { calls.appended += 1; setTimeout(() => node.onload?.(), 0); } },
  };
  return { doc, frame, calls };
}

test("benefit labels", () => {
  assert.equal(couponBenefitLabel(coupon), "15 minutos gratis");
  assert.equal(couponBenefitLabel({ benefitType: "PERCENTAGE", value: 10 }), "10% de descuento");
  assert.match(couponBenefitLabel({ benefitType: "FIXED_AMOUNT", value: 1500 }), /^\$1\.500 de descuento$/);
});

test("print document escapes data, embeds each QR and has no auto-print script", () => {
  const html = couponPrintDocument([coupon, { ...coupon, code: "PF-00000002" }], ["data:image/png;base64,AAA", "data:image/png;base64,BBB"], () => "20-10-26 9:23");
  assert.match(html, /^<!doctype html>/);
  assert.equal((html.match(/<article class="coupon">/g) || []).length, 2);
  assert.ok(html.includes("Navidad &lt;b&gt;"));
  assert.ok(html.includes("data:image/png;base64,AAA") && html.includes("data:image/png;base64,BBB"));
  assert.ok(html.includes("Tienda de prueba QA") && html.includes("15 minutos gratis") && html.includes("20-10-26 9:23"));
  assert.ok(!/<script/i.test(html));
});

test("prints from a hidden iframe in the same page and reports opened when the dialog opens", async () => {
  const { doc, frame, calls } = fakeDocument();
  const result = await printHtmlInFrame(doc, "<p>x</p>");
  assert.deepEqual(result, { opened: true });
  assert.equal(calls.appended, 1);
  assert.equal(calls.print, 1);
  assert.equal(frame.srcdoc, "<p>x</p>");
  assert.equal(frame.attrs["aria-hidden"], "true");
});

test("reports not opened when print throws, no dialog opens, or there is no frame window", async () => {
  assert.deepEqual(await printHtmlInFrame(fakeDocument({ printThrows: true }).doc, "x"), { opened: false });
  assert.deepEqual(await printHtmlInFrame(fakeDocument({ printOpensDialog: false }).doc, "x"), { opened: false });
  assert.deepEqual(await printHtmlInFrame(fakeDocument({ noWindow: true }).doc, "x"), { opened: false });
});

test("reports not opened when the frame never loads", async () => {
  const { doc } = fakeDocument();
  doc.body.appendChild = () => {};
  assert.deepEqual(await printHtmlInFrame(doc, "x", { loadTimeoutMs: 10 }), { opened: false });
});

test("removes the iframe after printing", async () => {
  const { doc, calls } = fakeDocument();
  await printHtmlInFrame(doc, "x");
  await new Promise((resolve) => setTimeout(resolve, 1100));
  assert.equal(calls.removed, 1);
});

test("coupons screen no longer opens a popup and marks delivery only after the dialog opened", () => {
  const source = readFileSync(new URL("../../components/cupones/CouponsClient.js", import.meta.url), "utf8");
  assert.ok(!source.includes("window.open"));
  const body = source.slice(source.indexOf("async function printCoupon"), source.indexOf("async function sendByEmail"));
  assert.ok(body.indexOf("printHtmlInFrame") > -1);
  assert.ok(body.indexOf("if (!opened)") < body.indexOf('method: "PATCH"'));
  assert.ok(body.indexOf("printHtmlInFrame") < body.indexOf('method: "PATCH"'));
});
