import "server-only";
import { shiftDisplay } from "./shiftDisplay.mjs";

export async function loadShiftPresentations(db, parking, shifts) {
  const companyId = parking.companyId || parking.company_id;
  if (!companyId) throw new Error("SHIFT_COMPANY_RELATION_MISSING");
  const operators = [...new Set(shifts.map(s => s.operator_id))];
  const [members, assignments, sectors, streets] = await Promise.all([
    operators.length ? db.from("company_members").select("user_id,full_name").eq("company_id", companyId).in("user_id", operators) : { data: [] },
    db.from("operator_assignments").select("*").eq("parking_id", parking.id),
    db.from("parking_sectors").select("id,code,name").eq("parking_id", parking.id),
    db.from("parking_streets").select("id,name,sector_id").eq("parking_id", parking.id),
  ]);
  for (const result of [members, assignments, sectors, streets]) if (result.error) throw result.error;
  return shifts.map(shift => {
    const assignment = (assignments.data || []).find(a => a.id === shift.assignment_id);
    const sector = (sectors.data || []).find(s => s.id === shift.sector_id);
    const street = (streets.data || []).find(s => s.id === shift.street_id);
    const operatorName = (members.data || []).find(m => m.user_id === shift.operator_id)?.full_name;
    return { ...shift, presentation: shiftDisplay({ parking, assignment, sector, street, operatorName }), assignment, sector, street };
  });
}
