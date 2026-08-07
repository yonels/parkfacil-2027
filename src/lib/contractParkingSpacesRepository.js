import "server-only";

const mapRow = (row) => ({
  id: row.id,
  contractId: row.contract_id,
  parkingId: row.parking_id,
  contractedSpaces: row.contracted_spaces,
  notes: row.notes || "",
  updatedAt: row.updated_at,
});

// Resuelve el contrato vigente de la empresa dueña del parking. El cliente nunca envía
// un contractId: siempre se deriva del company_id del parking, así que un contrato de
// la Empresa A jamás puede asociarse a un parking de la Empresa B por esta vía.
async function findActiveContractForCompany(db, companyId) {
  const { data, error } = await db
    .from("company_contracts")
    .select("id,company_id,status")
    .eq("company_id", companyId)
    .in("status", ["active", "pending_signature", "suspended"])
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getContractedSpaces(db, parkingId) {
  const { data, error } = await db.from("contract_parking_spaces").select("*").eq("parking_id", parkingId).maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : null;
}

export async function setContractedSpaces(db, { parkingId, companyId, contractedSpaces, notes = "" }) {
  const contract = await findActiveContractForCompany(db, companyId);
  if (!contract) throw Object.assign(new Error("La empresa no tiene un contrato vigente registrado."), { code: "CONTRACT_NOT_FOUND" });
  const { data, error } = await db
    .from("contract_parking_spaces")
    .upsert({ contract_id: contract.id, parking_id: parkingId, contracted_spaces: contractedSpaces, notes }, { onConflict: "contract_id,parking_id" })
    .select("*")
    .single();
  if (error) throw error;
  return mapRow(data);
}

export async function deleteContractedSpaces(db, parkingId) {
  const { error } = await db.from("contract_parking_spaces").delete().eq("parking_id", parkingId);
  if (error) throw error;
}
