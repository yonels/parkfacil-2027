// «Historial del cliente» (SOL-2026-11-05-005; prototipo aprobado 2026-11-09). Código puro: arma, desde los datos ya
// guardados, cada factura con sus notas, pagos, correos y respuesta del SII, la línea de tiempo y el resumen de cuenta.
// Regla de lo disponible para acreditar, igual que la base (billing_begin_related_document): total de la factura menos
// las notas de crédito emitidas o en emisión.
export const HISTORY_TYPES = Object.freeze({
  pre: "Prefactura", fac: "Factura", nc: "Nota de crédito", nd: "Nota de débito", pago: "Pago", mail: "Correo", sii: "SII / respuesta", cambio: "Cambios",
});
const CREDIT_USED = ["ISSUING", "ISSUED", "PROVIDER_PENDING"];
const PRE_ACTIONS = { CALCULATE: "Prefactura calculada", RECALCULATE: "Prefactura recalculada", RECALCULATED: "Prefactura recalculada", REVIEW_STARTED: "Prefactura en revisión", APPROVED: "Prefactura aprobada", MARKED_READY_TO_ISSUE: "Prefactura lista para emitir", CANCELLED: "Prefactura anulada", ADJUSTMENT_ADDED: "Ajuste agregado a la prefactura", ADJUSTMENT_REMOVED: "Ajuste quitado de la prefactura", COMMENT_ADDED: "Observación en la prefactura" };
const amount = (doc) => Math.round(Number(doc?.total_amount) || 0);
// Neto (incluye exento) e IVA de un documento o fila importada; si no vienen, el neto es el total menos el IVA.
const taxOf = (doc) => Math.round(Number(doc?.tax_amount) || 0);
const netOf = (doc) => (doc?.net_amount != null ? Math.round(Number(doc.net_amount) || 0) + Math.round(Number(doc.exempt_amount) || 0) : amount(doc) - taxOf(doc));
const day = (value) => String(value || "").slice(0, 10);

function siiLabel(status) {
  const text = String(status || "");
  if (/^SII:/i.test(text)) return text.replace(/^SII:\s*/i, "");
  return { EMITIDO_PRUEBA: "Emitido (pruebas)", EMITIDO: "Emitido", ACCEPTED: "Aceptado (simulado)" }[text] || "";
}

function event(type, at, title, sub = "", amt = null, extra = {}) {
  return { type, at: String(at || ""), title, sub, amount: amt, ...extra };
}

// Estado visible de una factura (como en el prototipo aprobado).
export function invoiceStatus({ rejected, discarded, imported, total, credited, debited, paid, dueDate, fullNoteFolio, today }) {
  if (discarded) return { tone: "lock", label: "Rechazada · descartada" };
  if (rejected) return { tone: "err", label: "Rechazada por el proveedor" };
  const creditable = Math.max(0, total - credited);
  const balance = Math.max(0, total + debited - credited - paid);
  if (creditable === 0) return { tone: "err", label: fullNoteFolio ? `Anulada con nota de crédito ${fullNoteFolio}` : "Anulada con nota de crédito" };
  if (balance === 0) return { tone: "ok", label: "Pagada" };
  if (imported && !paid) return { tone: "lock", label: "Importada · pagos no registrados" };
  if (dueDate && dueDate < today) return { tone: "warn", label: "Vencida" };
  if (credited > 0) return { tone: "violet", label: "Con nota de crédito parcial" };
  return { tone: "info", label: "Vigente" };
}

export function buildClientHistory({ documents = [], preinvoices = [], applications = [], registry = [], audits = [], items = [], confirmations = [], today = new Date().toISOString().slice(0, 10) }) {
  const preById = new Map(preinvoices.map((p) => [p.id, p]));
  const appsByDoc = new Map();
  for (const app of applications) if (app.status === "ACTIVE") appsByDoc.set(app.document_id, [...(appsByDoc.get(app.document_id) || []), app]);
  const notesByOrigin = new Map();
  for (const doc of documents) if (doc.document_reference_id) notesByOrigin.set(doc.document_reference_id, [...(notesByOrigin.get(doc.document_reference_id) || []), doc]);
  const auditsByPre = new Map();
  for (const a of audits) if (a.preinvoice_id && PRE_ACTIONS[a.action]) auditsByPre.set(a.preinvoice_id, [...(auditsByPre.get(a.preinvoice_id) || []), a]);
  const discardedIds = new Set(audits.filter((a) => a.action === "DOCUMENT_DISCARDED").map((a) => a.new_value?.documentId).filter(Boolean));

  const invoices = [];
  const linkedRegistry = new Set(registry.map((r) => r.billing_document_id).filter(Boolean));

  for (const doc of documents.filter((d) => d.document_type === "INVOICE")) {
    const notes = (notesByOrigin.get(doc.id) || []).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const credits = notes.filter((n) => n.document_type === "CREDIT_NOTE");
    const debits = notes.filter((n) => n.document_type === "DEBIT_NOTE");
    const credited = credits.filter((n) => CREDIT_USED.includes(n.status)).reduce((s, n) => s + amount(n), 0);
    const debited = debits.filter((n) => n.status === "ISSUED").reduce((s, n) => s + amount(n), 0);
    const apps = appsByDoc.get(doc.id) || [];
    const paid = apps.reduce((s, a) => s + Math.round(Number(a.amount) || 0), 0);
    const total = amount(doc);
    const discarded = doc.status === "DISCARDED" || discardedIds.has(doc.id);
    const rejected = ["PROVIDER_REJECTED", "ISSUE_ERROR"].includes(doc.status);
    const simulated = doc.provider === "mock";
    const full = credits.find((n) => n.correction_mode === "TOTAL" && n.status === "ISSUED");
    const pre = preById.get(doc.preinvoice_id);
    const events = [];
    for (const a of (auditsByPre.get(doc.preinvoice_id) || [])) events.push(event("pre", a.created_at, `${PRE_ACTIONS[a.action]}${pre?.internal_number ? ` · ${pre.internal_number}` : ""}`, a.reason || ""));
    if (discarded || rejected) events.push(event("fac", doc.created_at, rejected ? "Factura rechazada por el proveedor" : "Factura rechazada", `${doc.provider_status || ""}${doc.folio ? "" : " · sin folio"}`.trim()));
    else events.push(event("fac", doc.created_at, `Factura emitida${doc.folio ? ` · folio ${doc.folio}` : ""}`, simulated ? "Simulada (sin validez en el SII)" : doc.provider === "haulmer" ? "Haulmer" : "", total, { documentId: doc.id, net: netOf(doc), tax: taxOf(doc) }));
    const discardAudit = audits.find((a) => a.action === "DOCUMENT_DISCARDED" && a.new_value?.documentId === doc.id);
    if (discardAudit) events.push(event("cambio", discardAudit.created_at, "Documento descartado", `Motivo: ${discardAudit.new_value?.reason || "—"}`));
    if (doc.email_sent_at || doc.email_status) events.push(event("mail", doc.email_sent_at || doc.updated_at, doc.email_status === "SENT" ? "Correo con PDF enviado" : doc.email_status === "FAILED" ? "Correo no enviado" : "Correo omitido", doc.email_status === "SENT" ? doc.email_to || "" : doc.email_error || ""));
    const sii = siiLabel(doc.provider_status);
    if (sii && !rejected && !discarded) events.push(event("sii", doc.updated_at, `Estado SII: ${sii}`));
    for (const n of notes) {
      const credit = n.document_type === "CREDIT_NOTE";
      const ok = n.status === "ISSUED";
      events.push(event(credit ? "nc" : "nd", n.created_at, `${credit ? "Nota de crédito" : "Nota de débito"}${credit && n.correction_mode ? ` ${n.correction_mode === "TOTAL" ? "TOTAL" : "PARCIAL"}` : ""}${ok ? " emitida" : n.status === "DISCARDED" ? " descartada" : " no emitida"}${n.folio ? ` · folio ${n.folio}` : ""}`, n.reason ? `Motivo: ${n.reason}` : "", ok ? (credit ? -amount(n) : amount(n)) : null, { documentId: n.id, net: netOf(n), tax: taxOf(n) }));
      if (n.email_sent_at && n.email_status === "SENT") events.push(event("mail", n.email_sent_at, `Correo con PDF de la ${credit ? "NC" : "ND"} enviado`, n.email_to || ""));
    }
    for (const a of apps) events.push(event("pago", a.created_at, "Pago aplicado", a.reference || "", -Math.round(Number(a.amount) || 0)));
    events.sort((a, b) => a.at.localeCompare(b.at));
    invoices.push({
      key: doc.id, documentId: doc.id, origin: simulated ? "ParkFacil (simulada)" : "ParkFacil", provider: doc.provider, folio: doc.folio || null,
      date: day(doc.invoice_date), dueDate: day(doc.due_date), total, net: netOf(doc), tax: taxOf(doc), credited, debited, paid,
      creditable: discarded || rejected ? 0 : Math.max(0, total - credited),
      balance: discarded || rejected ? 0 : Math.max(0, total + debited - credited - paid),
      rejected: discarded || rejected, discarded, simulated, sii,
      notes: notes.filter((n) => n.status === "ISSUED").map((n) => ({ type: n.document_type, folio: n.folio, amount: amount(n), mode: n.correction_mode })),
      status: invoiceStatus({ rejected, discarded, total, credited, debited, paid, dueDate: day(doc.due_date), fullNoteFolio: full?.folio, today }),
      events,
    });
  }

  // Facturas importadas (EasyDoc, Registro de Ventas del SII, Haulmer) que no son documentos propios.
  const regInvoices = registry.filter((r) => [33, 34].includes(Number(r.dte_type)) && !linkedRegistry.has(r.billing_document_id) && !r.billing_document_id);
  const regNotes = registry.filter((r) => [56, 61].includes(Number(r.dte_type)) && !r.billing_document_id);
  for (const r of regInvoices) {
    const notes = regNotes.filter((n) => Number(n.reference_folio) === Number(r.folio) && n.issuer_rut === r.issuer_rut);
    const credited = notes.filter((n) => Number(n.dte_type) === 61 && !n.voided).reduce((s, n) => s + Math.round(Number(n.total_amount) || 0), 0);
    const debited = notes.filter((n) => Number(n.dte_type) === 56 && !n.voided).reduce((s, n) => s + Math.round(Number(n.total_amount) || 0), 0);
    const total = Math.round(Number(r.total_amount) || 0);
    const source = { EASYDOC: "EasyDoc", SII_RCV: "Registro de Ventas SII", HAULMER: "Haulmer" }[r.source] || r.source;
    const events = [event("fac", r.issue_date, `Factura folio ${r.folio} (${source}, importada)`, r.voided ? "Anulada en el sistema de origen" : "", total, { registryId: r.id, providerToken: r.provider_token || null, net: netOf(r), tax: taxOf(r) })];
    if (r.sii_status) events.push(event("sii", r.issue_date, `Estado SII: ${r.sii_status}`));
    if (r.customer_response) events.push(event("sii", r.updated_at || r.issue_date, `Respuesta del cliente: ${r.customer_response}`));
    for (const n of notes) events.push(event(Number(n.dte_type) === 61 ? "nc" : "nd", n.issue_date, `${Number(n.dte_type) === 61 ? "Nota de crédito" : "Nota de débito"} folio ${n.folio} (${source})`, "", Number(n.dte_type) === 61 ? -Math.round(Number(n.total_amount) || 0) : Math.round(Number(n.total_amount) || 0), { net: netOf(n), tax: taxOf(n) }));
    events.sort((a, b) => a.at.localeCompare(b.at));
    invoices.push({
      key: `reg-${r.id}`, registryId: r.id, providerToken: r.provider_token || null, origin: source, folio: String(r.folio), date: day(r.issue_date), dueDate: "",
      total, net: netOf(r), tax: taxOf(r), credited, debited, paid: 0, creditable: Math.max(0, total - credited), balance: Math.max(0, total + debited - credited),
      rejected: false, imported: true, voided: Boolean(r.voided), sii: r.sii_status || "", response: r.customer_response || "",
      notes: notes.map((n) => ({ type: Number(n.dte_type) === 61 ? "CREDIT_NOTE" : "DEBIT_NOTE", folio: String(n.folio), amount: Math.round(Number(n.total_amount) || 0) })),
      status: r.voided ? { tone: "lock", label: "Anulada en origen" } : invoiceStatus({ imported: true, total, credited, debited, paid: 0, today }),
      events,
    });
  }
  invoices.sort((a, b) => b.date.localeCompare(a.date) || String(b.folio || "").localeCompare(String(a.folio || "")));

  // Movimientos sin factura: cambios de servicios, datos confirmados, prefacturas sin emitir.
  const loose = [];
  for (const item of items) loose.push(event("cambio", item.created_at, `Servicio asignado: ${item.code ? `${item.code} ` : ""}${item.description || ""}`.trim(), `${item.quantity ?? 1} × ${item.unit_price} ${item.currency || ""} · desde ${day(item.valid_from)}${item.status !== "ACTIVE" ? ` · ${item.status === "INACTIVE" ? "inactivo" : "terminado"}` : ""}`));
  for (const c of confirmations) if (c.step === "datos") loose.push(event("cambio", c.confirmed_at, `Datos tributarios confirmados (${c.period})`, "Etapa Datos del ciclo"));
  const invoicedPre = new Set(documents.filter((d) => d.document_type === "INVOICE").map((d) => d.preinvoice_id));
  for (const p of preinvoices.filter((x) => !invoicedPre.has(x.id))) for (const a of (auditsByPre.get(p.id) || [])) loose.push(event("pre", a.created_at, `${PRE_ACTIONS[a.action]} · ${p.internal_number}`, `Período ${p.period}`));

  const timeline = [...invoices.flatMap((inv) => inv.events.map((e) => ({ ...e, invoiceFolio: inv.folio, invoiceKey: inv.key }))), ...loose].sort((a, b) => b.at.localeCompare(a.at));

  const real = invoices.filter((i) => !i.rejected && !i.simulated && !i.voided);
  const summary = {
    invoiced: real.reduce((s, i) => s + i.total, 0),
    credited: real.reduce((s, i) => s + i.credited, 0),
    debited: real.reduce((s, i) => s + i.debited, 0),
    paid: real.reduce((s, i) => s + i.paid, 0),
    balance: real.filter((i) => !i.imported).reduce((s, i) => s + i.balance, 0),
    overdue: real.filter((i) => i.status.label === "Vencida").length,
    invoices: real.length, simulated: invoices.filter((i) => i.simulated).length, imported: real.filter((i) => i.imported).length,
  };
  return { invoices, timeline, summary };
}
