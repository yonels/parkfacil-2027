// Identidad de la empresa de la cuenta (razón social, nombre de fantasía, RUT y
// administradores) para Inicio y el Dashboard Off Street del Portal Cliente
// (SOL-2026-10-21-002; recupera el recuadro «Tu empresa» de d8ca214).

export function formatCompanyRut(rutNumber, rutDv) {
  const number = String(rutNumber ?? "").replace(/\D/g, "");
  const dv = String(rutDv ?? "").trim().toUpperCase();
  if (!number || !dv) return null;
  return `${number.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dv}`;
}

export function shapeCompanyIdentity(company, adminNames = []) {
  if (!company) return null;
  const admins = [...new Set((adminNames || []).map((name) => String(name ?? "").trim()).filter(Boolean))];
  return {
    businessName: company.business_name || company.trade_name || "",
    tradeName: company.trade_name && company.trade_name !== company.business_name ? company.trade_name : null,
    rut: formatCompanyRut(company.rut_number, company.rut_dv),
    admins,
  };
}

// db: cliente server-side (service role). Nunca lanza: sin datos, el recuadro no se muestra.
export async function loadCompanyIdentity(db, companyId) {
  if (!db || !companyId) return null;
  try {
    const [{ data: company, error }, { data: members }] = await Promise.all([
      db.from("companies").select("id,business_name,trade_name,rut_number,rut_dv").eq("id", companyId).maybeSingle(),
      db.from("company_members").select("full_name").eq("company_id", companyId).eq("role", "company_admin").eq("status", "active"),
    ]);
    if (error) return null;
    return shapeCompanyIdentity(company, (members || []).map((member) => member.full_name));
  } catch {
    return null;
  }
}
