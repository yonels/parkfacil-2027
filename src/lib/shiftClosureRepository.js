import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

const db = () => getSupabaseAdminClient();
export async function getShiftContext(shiftId) {
  const shiftResult=await db().from("operator_shifts").select("*").eq("id",shiftId).single();
  if(shiftResult.error)throw shiftResult.error;const shift=shiftResult.data;
  const [assignmentResult,parkingResult,sectorResult,streetResult]=await Promise.all([
    db().from("operator_assignments").select("*").eq("id",shift.assignment_id).single(),
    db().from("parkings").select("*").eq("id",shift.parking_id).single(),
    db().from("parking_sectors").select("id,code,name").eq("id",shift.sector_id).single(),
    db().from("parking_streets").select("*").eq("id",shift.street_id).single(),
  ]);
  for(const result of [assignmentResult,parkingResult,sectorResult,streetResult])if(result.error)throw result.error;
  const a=assignmentResult.data,p=parkingResult.data,s=sectorResult.data,street=streetResult.data;
  return {shift:{id:shift.id,operatorId:shift.operator_id,date:shift.shift_date,openedAt:shift.opened_at,scheduledStart:shift.scheduled_start,status:shift.status},assignment:{id:a.id,parkingId:a.parking_id,sectorId:a.sector_id,streetId:a.street_id,numberFrom:a.number_from,numberTo:a.number_to,assignedSpaces:a.max_vehicles,startTime:a.start_time,endTime:a.end_time},parking:{id:p.id,name:p.name,companyName:p.company_name||p.company_id},sector:{id:s.id,name:`Sector ${s.code} - ${s.name}`},street:{id:street.id,name:street.name}};
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
