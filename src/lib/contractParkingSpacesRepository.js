import "server-only";
import { pickContractedSpacesRow } from "./contractedSpacesInput.mjs";

const mapRow = (row) => ({
  id: row.id,
  contractId: row.contract_id,
  parkingId: row.parking_id,
  contractedSpaces: row.contracted_spaces,
  source: row.contract_id ? "contract" : "manual",
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
  const { data, error } = await db.from("contract_parking_spaces").select("*").eq("parking_id", parkingId);
  if (error) throw error;
  const row = pickContractedSpacesRow(data || []);
  return row ? mapRow(row) : null;
}

export async function setContractedSpaces(db, { parkingId, companyId, contractedSpaces, notes = "" }) {
  const contract = await findActiveContractForCompany(db, companyId);
  if (!contract) return saveManualSpaces(db, { parkingId, contractedSpaces, notes });
  const { data, error } = await db
    .from("contract_parking_spaces")
    .upsert({ contract_id: contract.id, parking_id: parkingId, contracted_spaces: contractedSpaces, notes }, { onConflict: "contract_id,parking_id" })
    .select("*")
    .single();
  if (error) throw error;
  const manual = await db.from("contract_parking_spaces").delete().eq("parking_id", parkingId).is("contract_id", null);
  if (manual.error) throw manual.error;
  return mapRow(data);
}

// Empresa sin contrato vigente: una sola fila con contract_id nulo por estacionamiento.
async function saveManualSpaces(db, { parkingId, contractedSpaces, notes }) {
  const current = await db.from("contract_parking_spaces").select("id").eq("parking_id", parkingId).is("contract_id", null).maybeSingle();
  if (current.error) throw current.error;
  const values = { contract_id: null, parking_id: parkingId, contracted_spaces: contractedSpaces, notes };
  const query = current.data
    ? db.from("contract_parking_spaces").update(values).eq("id", current.data.id)
    : db.from("contract_parking_spaces").insert(values);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return mapRow(data);
}

export async function deleteContractedSpaces(db, parkingId) {
  const { error } = await db.from("contract_parking_spaces").delete().eq("parking_id", parkingId);
  if (error) throw error;
}
