import "server-only";
import { loadShiftPresentations } from "./shiftPresentationRepository";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

const db = () => getSupabaseAdminClient();
export async function getShiftContext(shiftId) {
  const client = db();
  const shiftResult = await client.from("operator_shifts").select("*").eq("id",shiftId).single();
  if (shiftResult.error) throw shiftResult.error;
  const row = shiftResult.data;
  const parkingResult = await client.from("parkings").select("*").eq("id",row.parking_id).single();
  if (parkingResult.error) throw parkingResult.error;
  const parking = parkingResult.data;
  const [resolved] = await loadShiftPresentations(client, parking, [row]);
  const a = resolved.assignment;
  return {
    shift: { id: row.id, operatorId: row.operator_id, parkingId: row.parking_id, date: row.shift_date, openedAt: row.opened_at, scheduledStart: row.scheduled_start, status: row.status },
    operator: { id: row.operator_id, name: resolved.presentation.operatorName },
    presentation: resolved.presentation,
    assignment: a ? { id:a.id, numberFrom:a.number_from, numberTo:a.number_to, assignedSpaces:a.max_vehicles } : null,
    parking: { id:parking.id, type:parking.type, name:parking.name, companyName:parking.company_name || parking.company_id },
    sector: resolved.sector || null, street: resolved.street || null,
  };
}
export async function closeShiftTransaction(shiftId,actor,input){
  const {data,error}=await db().rpc("close_operator_shift",{p_shift_id:shiftId,p_actor_id:actor.id,p_actor_name:actor.name,p_actor_is_admin:actor.isAdmin,p_notes:input.observations});
  if(error)throw error;return Array.isArray(data)?data[0]:data;
}
export async function getPersistedClosure(identifier){
  const {data,error}=await db().from("shift_closures").select("*").or(`id.eq.${identifier},shift_id.eq.${identifier}`).limit(1);
  if(error)throw error;if(!data?.length)return null;return mapClosure(data[0]);
}
export function mapClosure(row){return {id:row.id,shiftId:row.shift_id,assignmentId:row.assignment_id,operatorId:row.operator_id,operatorName:row.operator_name,companyName:row.company_name,parkingName:row.parking_name,sectorName:row.sector_name,streetName:row.street_name,numberFrom:row.number_from,numberTo:row.number_to,assignedSpaces:row.assigned_spaces,shiftDate:row.shift_date,actualStartAt:row.actual_start_at,actualCloseAt:row.actual_close_at,collectedAmount:Number(row.collected_amount),paidVehicles:row.paid_vehicles_count,pendingVehicles:row.pending_vehicles_count,cancelledVehicles:row.cancelled_vehicles_count,observations:row.notes,closureStatus:row.closure_status,folio:row.folio,createdAt:row.created_at};}
