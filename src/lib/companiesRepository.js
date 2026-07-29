import "server-only";
import { listParkings } from "@/lib/estacionamientosRepository";

function mapParking(row) {
  return {
    id: row.id,
    nombre: row.name,
    codigo: row.code,
    direccion: row.address,
    ciudad: row.city,
    pais: row.country,
    estado: row.status,
    tipo: row.type,
    capacidad: row.metrics?.capacity ?? 0,
  };
}

function mapContract(row) {
  if (!row) return null;
  return {
    id: row.id,
    numero: row.contract_number,
    estado: row.status,
    fechaFirma: row.signed_on,
    fechaInicio: row.starts_on,
    fechaTermino: row.ends_on,
    duracionMeses: row.duration_months,
    renovacionAutomatica: row.automatic_renewal,
    avisoNoRenovacionDias: row.non_renewal_notice_days,
    moneda: row.currency,
    impuesto: row.tax_label,
    valorMensual: row.monthly_value,
    fuenteValorMensual: row.monthly_value_source,
    descuentoAnualPorcentaje: row.annual_discount_percent,
    plazoPagoDias: row.payment_due_days,
    valorReactivacion: row.reactivation_value,
    multaEquipo: row.equipment_penalty_value,
    documentoFuente: row.source_document,
    condiciones: row.commercial_terms || {},
  };
}

function mapCompany(row, parkings, contracts = [], members = []) {
  const companyContracts = contracts.filter((contract) => contract.company_id === row.id).map(mapContract);
  const companyMembers = members.filter((member) => member.company_id === row.id);
  return {
    id: row.id,
    razonSocial: row.business_name,
    nombreFantasia: row.trade_name,
    rutNumero: row.rut_number,
    rutDv: row.rut_dv,
    giro: row.business_activity,
    direccion: row.address,
    comuna: row.district,
    ciudad: row.city,
    region: row.region,
    pais: row.country,
    contactoPrincipal: row.primary_contact,
    correo: row.email,
    telefono: row.phone,
    representanteLegal: row.legal_representative,
    estado: row.status,
    tipoRelacion: row.relationship_type,
    fechaIncorporacion: row.incorporated_on,
    observaciones: row.notes,
    plan: ({
      UNASSIGNED: "Por definir",
      ESSENTIAL: "Esencial",
      PROFESSIONAL: "Profesional",
      ENTERPRISE: "Enterprise",
      CUSTOM: "Personalizado",
    })[row.commercial_plan] || "Por definir",
    estacionamientos: parkings.filter((parking) => parking.companyId === row.id).map(mapParking),
    usuarios: companyMembers.length,
    resumenUsuarios: {
      administradores: companyMembers.filter((member) => member.role === "company_admin").length,
      operadores: companyMembers.filter((member) => member.role === "operator").length,
    },
    contrato: companyContracts.find((contract) => ["active", "pending_signature", "suspended"].includes(contract.estado)) || companyContracts[0] || null,
    contratos: companyContracts,
    documentos: [],
    historial: [],
  };
}

export async function listCompanies(supabase) {
  const [{ data: companies, error }, parkings, contractResult, memberResult] = await Promise.all([
    supabase.from("companies").select("*").order("business_name"),
    listParkings(supabase),
    supabase.from("company_contracts").select("*").order("starts_on", { ascending: false }),
    supabase.from("company_members").select("company_id,role,status"),
  ]);
  if (error) throw error;
  if (contractResult.error) throw contractResult.error;
  if (memberResult.error) throw memberResult.error;
  return (companies || []).map((company) => mapCompany(
    company,
    parkings || [],
    contractResult.data || [],
    memberResult.data || [],
  ));
}

export async function getCompany(supabase, id) {
  const companies = await listCompanies(supabase);
  return companies.find((company) => company.id === id) || null;
}
