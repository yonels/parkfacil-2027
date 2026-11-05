import test from "node:test";
import assert from "node:assert/strict";
import { clpTotals, lineTax, preinvoiceTotals, splitNetByTax } from "./taxCore.mjs";

test("reproduce la factura N° 278 de EasyDoc: neto 61.871, IVA 11.755, total 73.626", () => {
  assert.deepEqual(clpTotals({ taxableNet: 61871, exemptNet: 0 }), { taxableClp: 61871, exemptClp: 0, netClp: 61871, taxClp: 11755, totalClp: 73626 });
});

test("UF → CLP: primero el neto en pesos, después el IVA sobre ese neto", () => {
  const totals = clpTotals({ taxableNet: 1.5, exemptNet: 0, ufValue: 41274.2 });
  assert.equal(totals.taxableClp, 61911);
  assert.equal(totals.taxClp, 11763);
  assert.equal(totals.totalClp, 73674);
});

test("servicios exentos no llevan IVA", () => {
  const totals = clpTotals({ taxableNet: 1000, exemptNet: 500 });
  assert.equal(totals.netClp, 1500);
  assert.equal(totals.taxClp, 190);
  assert.equal(totals.totalClp, 1690);
});

test("sin clasificación tributaria no se calcula", () => {
  assert.throws(() => splitNetByTax([{ net: 1, taxCategory: "UNDEFINED" }]), (e) => e.code === "TAX_CLASSIFICATION_REQUIRED");
  assert.throws(() => splitNetByTax([{ net: 1 }]), (e) => e.code === "TAX_CLASSIFICATION_REQUIRED");
});

test("totales de prefactura en UF con 4 decimales y descuento afecto", () => {
  const totals = preinvoiceTotals([{ net: 1.5625, taxCategory: "TAXABLE" }, { net: -0.0625, taxCategory: "TAXABLE" }], "UF");
  assert.deepEqual(totals, { taxableNet: 1.5, exemptNet: 0, netAmount: 1.5, taxAmount: 0.285, totalAmount: 1.785 });
  assert.equal(lineTax({ net: 1.5625, taxCategory: "TAXABLE" }, "UF"), 0.2969);
  assert.equal(lineTax({ net: 61871, taxCategory: "TAXABLE" }, "CLP"), 11755);
  assert.equal(lineTax({ net: 100, taxCategory: "EXEMPT" }, "CLP"), 0);
});

test("montos definitivos de la factura siempre en pesos, coherentes entre sí", async () => {
  const { definitiveInvoiceAmounts } = await import("./taxCore.mjs");
  assert.deepEqual(definitiveInvoiceAmounts({ currency: "UF", ufValue: 41274.2, lines: [{ net: 1.5, taxCategory: "TAXABLE" }] }), { currency: "CLP", net: 61911, exempt: 0, tax: 11763, total: 73674 });
  assert.deepEqual(definitiveInvoiceAmounts({ currency: "CLP", lines: [{ net: 61871, taxCategory: "TAXABLE" }] }), { currency: "CLP", net: 61871, exempt: 0, tax: 11755, total: 73626 });
});

test("varias líneas en UF: el neto es la suma de las líneas redondeadas a pesos", async () => {
  const { definitiveInvoiceAmounts } = await import("./taxCore.mjs");
  const r = definitiveInvoiceAmounts({ currency: "UF", ufValue: 41274.2, lines: [{ net: 1.5625, taxCategory: "TAXABLE" }, { net: 0.25, taxCategory: "TAXABLE" }, { net: 0.1, taxCategory: "EXEMPT" }] });
  assert.deepEqual(r, { currency: "CLP", net: 64491 + 10319 + 4127, exempt: 4127, tax: Math.round((64491 + 10319) * 0.19), total: 64491 + 10319 + 4127 + Math.round((64491 + 10319) * 0.19) });
});
