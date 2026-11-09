import "server-only";
import { buildClientHistory } from "./clientHistoryCore.mjs";
import { normalizeRut } from "./dteRegistryCore.mjs";

// «Historial del cliente» (SOL-2026-11-05-005): lee todo lo guardado de una empresa y lo arma con clientHistoryCore.
// Usa el cliente de servicio; la ruta valida el permiso de lectura de facturación.
function fail(error, message) {
  if (!error) return;
  const wrapped = new Error(`${message}: ${error.message}`);
  wrapped.code = error.code;
  throw wrapped;
}

export async function getClientHistory(db, companyId, { today } = {}) {
  const company = await db.from("companies").select("id,business_name,rut_number,rut_dv,status,email,created_at").eq("id", companyId).maybeSingle();
  fail(company.error, "No fue posible leer la empresa");
  if (!company.data) { const error = new Error("La empresa no existe."); error.code = "COMPANY_NOT_FOUND"; error.status = 404; throw error; }
  const rut = company.data.rut_number ? normalizeRut(`${company.data.rut_number}-${company.data.rut_dv}`) : "";
  const [documents, preinvoices, audits, items, confirmations, registryByCompany, registryByRut] = await Promise.all([
    db.from("billing_documents").select("id,document_type,document_reference_id,preinvoice_id,provider,provider_status,provider_document_id,folio,status,correction_mode,reason,invoice_date,due_date,total_amount,email_status,email_to,email_error,email_sent_at,created_at,updated_at").eq("company_id", companyId).order("created_at"),
    db.from("billing_preinvoices").select("id,internal_number,period,status,created_at").eq("company_id", companyId),
    db.from("billing_audit_events").select("preinvoice_id,action,reason,new_value,created_at").eq("company_id", companyId).order("created_at").limit(2000),
    db.from("contract_billable_items").select("description,quantity,unit_price,currency,valid_from,status,created_at,billable_concepts(code)").eq("company_id", companyId),
    db.from("billing_cycle_confirmations").select("step,period,confirmed_at").eq("company_id", companyId),
    db.from("billing_dte_registry").select("id,source,issuer_rut,dte_type,folio,issue_date,total_amount,voided,sii_status,customer_response,reference_folio,provider_token,billing_document_id,updated_at").eq("company_id", companyId),
    rut ? db.from("billing_dte_registry").select("id,source,issuer_rut,dte_type,folio,issue_date,total_amount,voided,sii_status,customer_response,reference_folio,provider_token,billing_document_id,updated_at").eq("receiver_rut", rut) : Promise.resolve({ data: [] }),
  ]);
  for (const [result, label] of [[documents, "documentos"], [preinvoices, "prefacturas"], [audits, "auditoría"], [items, "servicios"], [confirmations, "confirmaciones"], [registryByCompany, "documentos importados"], [registryByRut, "documentos importados"]]) fail(result.error, `No fue posible leer ${label}`);
  const ids = (documents.data || []).map((d) => d.id);
  const applications = ids.length ? await db.from("billing_payment_applications").select("document_id,amount,status,application_date,created_at").in("document_id", ids) : { data: [] };
  fail(applications.error, "No fue posible leer los pagos");
  const registry = [...new Map([...(registryByCompany.data || []), ...(registryByRut.data || [])].map((r) => [r.id, r])).values()];
  const history = buildClientHistory({
    documents: documents.data || [], preinvoices: preinvoices.data || [], audits: audits.data || [], confirmations: confirmations.data || [], registry,
    applications: (applications.data || []).map((a) => ({ ...a, created_at: a.application_date || a.created_at })),
    items: (items.data || []).map((x) => ({ ...x, code: (Array.isArray(x.billable_concepts) ? x.billable_concepts[0] : x.billable_concepts)?.code || "" })),
    today,
  });
  return { company: { id: company.data.id, name: company.data.business_name, rut, status: company.data.status, email: company.data.email || "", since: String(company.data.created_at || "").slice(0, 10) }, ...history };
}
