// Asignación operativa base para turnos Off Street (sector "O" + calle
// "Operación general" + asignación ACTIVE del operador). Compartida por la
// programación de turnos (/api/estacionamientos/[id]/turnos) y el inicio de
// turno a pedido del POS (/api/pos/shift/start). Idempotente.
const OFF_STREET_SECTOR_CODE = "O";
const OFF_STREET_SECTOR_NAME = "Operación Off Street";
const OFF_STREET_STREET_NAME = "Operación general";

export async function ensureOffStreetAssignment(db, parking, operatorId) {
  let sector = null;
  const sectorResult = await db
    .from("parking_sectors")
    .select("id")
    .eq("parking_id", parking.id)
    .eq("code", OFF_STREET_SECTOR_CODE)
    .maybeSingle();
  if (sectorResult.error) throw sectorResult.error;
  sector = sectorResult.data;
  if (!sector) {
    const createSector = await db
      .from("parking_sectors")
      .insert({
        parking_id: parking.id,
        code: OFF_STREET_SECTOR_CODE,
        name: OFF_STREET_SECTOR_NAME,
        type: "OFF_STREET",
        status: "ACTIVE",
        capacity: 1,
        occupied: 0,
        level: "NIV-OPS",
        zone: "ZON-OPS",
        location_description: "Asignación operativa base para turnos Off Street.",
        notes: "AUTO_GENERATED_OFF_STREET_OPERATION",
      })
      .select("id")
      .single();
    if (createSector.error) throw createSector.error;
    sector = createSector.data;
  }

  let street = null;
  const streetResult = await db
    .from("parking_streets")
    .select("id")
    .eq("parking_id", parking.id)
    .eq("sector_id", sector.id)
    .eq("name", OFF_STREET_STREET_NAME)
    .maybeSingle();
  if (streetResult.error) throw streetResult.error;
  street = streetResult.data;
  if (!street) {
    const createStreet = await db
      .from("parking_streets")
      .insert({
        parking_id: parking.id,
        sector_id: sector.id,
        name: OFF_STREET_STREET_NAME,
        district: "OFF_STREET",
        status: "ACTIVE",
        capacity: 1,
        occupied: 0,
        notes: "AUTO_GENERATED_OFF_STREET_OPERATION",
      })
      .select("id")
      .single();
    if (createStreet.error) throw createStreet.error;
    street = createStreet.data;
  }

  const today = new Date().toISOString().slice(0, 10);
  const assignmentResult = await db
    .from("operator_assignments")
    .select("*")
    .eq("parking_id", parking.id)
    .eq("sector_id", sector.id)
    .eq("street_id", street.id)
    .eq("operator_id", operatorId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (assignmentResult.error) throw assignmentResult.error;
  if (assignmentResult.data) return assignmentResult.data;

  const createdAssignment = await db
    .from("operator_assignments")
    .insert({
      operator_id: operatorId,
      parking_id: parking.id,
      sector_id: sector.id,
      street_id: street.id,
      number_from: 1,
      number_to: 2,
      max_vehicles: 1,
      valid_from: today,
      valid_until: null,
      start_time: "00:00",
      end_time: "23:59",
      days_of_week: [1, 2, 3, 4, 5, 6, 7],
      status: "ACTIVE",
      supervisor_id: null,
      notes: "AUTO_GENERATED_OFF_STREET_OPERATION",
    })
    .select("*")
    .single();
  if (createdAssignment.error) throw createdAssignment.error;
  return createdAssignment.data;
}
