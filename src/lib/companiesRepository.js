import "server-only";

function relationUnavailable(error) {
  return ["42P01", "PGRST204", "PGRST205"].includes(error?.code);
}

function mapParking(row, contractedSpacesByParkingId = {}) {
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
    plazasContratadas: contractedSpacesByParkingId[row.id] ?? null,
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

function mapCompany(row, parkings, contracts = [], members = [], contractedSpacesByParkingId = {}) {
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
    estacionamientos: parkings.filter((parking) => parking.companyId === row.id).map((parking) => mapParking(parking, contractedSpacesByParkingId)),
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

function scoped(query, companyId) {
  return companyId ? query.eq("company_id", companyId) : query;
}

export async function listCompanies(supabase, { companyId = null } = {}) {
  const companyQuery = supabase.from("companies").select("*").order("business_name");
  const parkingQuery = supabase.from("parkings").select("*").order("code");
  const contractQuery = supabase.from("company_contracts").select("*").order("starts_on", { ascending: false });
  const memberQuery = supabase.from("company_members").select("company_id,role,status");
  const [{ data: companies, error }, parkingResult, contractResult, memberResult] = await Promise.all([
    companyId ? companyQuery.eq("id", companyId) : companyQuery,
    scoped(parkingQuery, companyId),
    scoped(contractQuery, companyId),
    scoped(memberQuery, companyId),
  ]);
  if (error) throw error;
  if (parkingResult.error && !relationUnavailable(parkingResult.error)) throw parkingResult.error;
  if (contractResult.error && !relationUnavailable(contractResult.error)) throw contractResult.error;
  if (memberResult.error && !relationUnavailable(memberResult.error)) throw memberResult.error;

  const parkingRows = parkingResult.error ? [] : (parkingResult.data || []);
  const contractRows = contractResult.error ? [] : (contractResult.data || []);
  const memberRows = memberResult.error ? [] : (memberResult.data || []);

  const parkings = parkingRows.map((row) => ({
    id: row.id, name: row.name, code: row.code, address: row.address, city: row.city,
    country: row.country, status: row.status, type: row.type, companyId: row.company_id,
    metrics: { capacity: 0 },
  }));
  const parkingIds = parkings.map((parking) => parking.id);
  let contractedSpacesByParkingId = {};
  if (parkingIds.length) {
    const { data: contractedSpaces, error: contractedSpacesError } = await supabase
      .from("contract_parking_spaces").select("parking_id,contracted_spaces").in("parking_id", parkingIds);
    // La tabla puede no existir aún en un entorno recién provisionado (42P01/PGRST205);
    // en ese caso se degrada a "sin dato" en vez de romper el listado de empresas.
    if (contractedSpacesError && !relationUnavailable(contractedSpacesError)) throw contractedSpacesError;
    contractedSpacesByParkingId = Object.fromEntries((contractedSpaces || []).map((row) => [row.parking_id, row.contracted_spaces]));
  }
  return (companies || []).map((company) => mapCompany(
    company,
    parkings || [],
    contractRows,
    memberRows,
    contractedSpacesByParkingId,
  ));
}

export async function getCompany(supabase, id, { companyId = null } = {}) {
  if (companyId && companyId !== id) return null;
  const companies = await listCompanies(supabase, { companyId: id });
  return companies.find((company) => company.id === id) || null;
}
