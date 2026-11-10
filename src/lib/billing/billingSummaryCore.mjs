// Indicadores de la portada de Facturación (SOL-2026-11-10-001, hallazgo H1): antes decían «Pendiente de implementación».
// Se calculan con los documentos emitidos y las prefacturas que ya entrega la API; solo montos en pesos (las prefacturas
// en UF se informan en UF).
const ISSUED = new Set(["ISSUED"]);
const TO_ISSUE = new Set(["APPROVED", "READY_TO_ISSUE", "ISSUING", "PROVIDER_PENDING"]);

const amount = (doc) => Number(doc.total_amount ?? doc.total ?? 0) || 0;

export function summarizeBilling({ documents = [], preinvoices = [], today = new Date().toISOString().slice(0, 10) } = {}) {
  const month = today.slice(0, 7);
  const issued = documents.filter((doc) => ISSUED.has(doc.status) && (doc.currency || "CLP") === "CLP");
  const invoicesOfMonth = issued.filter((doc) => doc.document_type === "INVOICE" && String(doc.invoice_date || "").startsWith(month));
  const creditsOfMonth = issued.filter((doc) => doc.document_type === "CREDIT_NOTE" && String(doc.invoice_date || "").startsWith(month));
  const debitsOfMonth = issued.filter((doc) => doc.document_type === "DEBIT_NOTE" && String(doc.invoice_date || "").startsWith(month));
  const sum = (rows, pick = amount) => rows.reduce((total, row) => total + pick(row), 0);
  const open = issued.filter((doc) => doc.document_type === "INVOICE" && ["PENDING", "PARTIAL", "OVERDUE"].includes(doc.financialStatus));
  const overdue = open.filter((doc) => doc.financialStatus === "OVERDUE");
  const balance = (doc) => Number(doc.balance ?? 0) || 0;
  const toIssue = preinvoices.filter((p) => TO_ISSUE.has(p.estado ?? p.status));
  const toIssueBy = (currency) => toIssue.filter((p) => (p.moneda ?? p.currency) === currency).reduce((total, p) => total + (Number(p.total ?? p.total_amount) || 0), 0);
  return {
    month,
    billedMonth: { amount: sum(invoicesOfMonth) + sum(debitsOfMonth) - sum(creditsOfMonth), invoices: invoicesOfMonth.length, credits: sum(creditsOfMonth), creditNotes: creditsOfMonth.length },
    toIssue: { count: toIssue.length, clp: toIssueBy("CLP"), uf: Math.round(toIssueBy("UF") * 10000) / 10000 },
    pending: { amount: sum(open, balance), count: open.length },
    overdue: { amount: sum(overdue, balance), count: overdue.length },
  };
}
