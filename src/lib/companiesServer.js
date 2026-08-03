import "server-only";
import { getEmpresasDemo } from "@/data/empresas.mjs";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { getCompany } from "@/lib/companiesRepository";

export async function getCompanyPageData(id) {
  try {
    return await getCompany(getSupabaseAdminClient(), id);
  } catch (error) {
    console.error("[company:page:fallback]", error?.code || error?.message || "connection_error");
    return getEmpresasDemo().find((company) => company.id === id || company.nombreFantasia === id || company.razonSocial === id) || null;
  }
}
