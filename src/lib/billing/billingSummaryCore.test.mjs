import test from "node:test";
import assert from "node:assert/strict";
import { summarizeBilling } from "./billingSummaryCore.mjs";

test("SOL-2026-11-10-001 H1: indicadores de la portada", () => {
  const documents = [
    { document_type: "INVOICE", status: "ISSUED", currency: "CLP", invoice_date: "2026-11-10", total_amount: 73724, balance: 0, financialStatus: "CREDITED" },
    { document_type: "CREDIT_NOTE", status: "ISSUED", currency: "CLP", invoice_date: "2026-11-10", total_amount: 73724 },
    { document_type: "INVOICE", status: "ISSUED", currency: "CLP", invoice_date: "2026-11-02", total_amount: 100000, balance: 100000, financialStatus: "PENDING" },
    { document_type: "INVOICE", status: "ISSUED", currency: "CLP", invoice_date: "2026-10-01", total_amount: 50000, balance: 20000, financialStatus: "OVERDUE" },
    { document_type: "INVOICE", status: "PROVIDER_REJECTED", currency: "CLP", invoice_date: "2026-11-08", total_amount: 1190, balance: 1190, financialStatus: "PENDING" },
  ];
  const preinvoices = [{ estado: "APPROVED", moneda: "UF", total: 1.785 }, { estado: "CALCULATED", moneda: "UF", total: 9 }, { estado: "READY_TO_ISSUE", moneda: "CLP", total: 5000 }];
  const s = summarizeBilling({ documents, preinvoices, today: "2026-11-10" });
  assert.deepEqual(s.billedMonth, { amount: 100000, invoices: 2, credits: 73724, creditNotes: 1 });
  assert.deepEqual(s.toIssue, { count: 2, clp: 5000, uf: 1.785 });
  assert.deepEqual(s.pending, { amount: 120000, count: 2 });
  assert.deepEqual(s.overdue, { amount: 20000, count: 1 });
});
