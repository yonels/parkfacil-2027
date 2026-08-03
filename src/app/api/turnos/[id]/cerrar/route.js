import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabaseAuthServer";
import { closeShiftTransaction,getShiftContext,mapClosure } from "@/lib/shiftClosureRepository";
import { OPERATIONAL_SOURCE_ERROR,sanitizeClosureInput,ShiftClosureError } from "@/lib/shiftClosure.mjs";

function failure(error){
  console.error("[shift:close]",error);
  const message=String(error?.message||"");
  if(message.includes("OPERATIONAL_DATA_SOURCE_UNAVAILABLE"))return NextResponse.json({error:OPERATIONAL_SOURCE_ERROR,code:"OPERATIONAL_DATA_SOURCE_UNAVAILABLE"},{status:503});
  if(message.includes("SHIFT_NOT_CLOSABLE")||message.includes("SHIFT_ALREADY_CLOSED"))return NextResponse.json({error:"El turno no está abierto o ya fue cerrado.",code:"SHIFT_NOT_CLOSABLE"},{status:409});
  if(message.includes("SHIFT_FORBIDDEN"))return NextResponse.json({error:"No tienes autorización para cerrar este turno.",code:"SHIFT_FORBIDDEN"},{status:403});
  if(error instanceof ShiftClosureError)return NextResponse.json({error:error.message,code:error.code},{status:error.status});
  return NextResponse.json({error:"No fue posible cerrar el turno.",code:"SHIFT_CLOSE_FAILED"},{status:500});
}
export async function GET(request,{params}){try{const actor=await authenticateRequest(request);if(!actor)return NextResponse.json({error:"Debes iniciar sesión.",code:"AUTH_REQUIRED"},{status:401});const {id}=await params;const context=await getShiftContext(id);if(context.shift.operatorId!==actor.id&&!actor.isAdmin)return NextResponse.json({error:"No tienes autorización para consultar este turno.",code:"SHIFT_FORBIDDEN"},{status:403});return NextResponse.json({data:{...context,operator:{id:context.shift.operatorId},summary:null,summaryError:{code:"OPERATIONAL_DATA_SOURCE_UNAVAILABLE",message:OPERATIONAL_SOURCE_ERROR}}});}catch(error){return failure(error);}}
export async function POST(request,{params}){try{const actor=await authenticateRequest(request);if(!actor)return NextResponse.json({error:"Debes iniciar sesión.",code:"AUTH_REQUIRED"},{status:401});const input=sanitizeClosureInput(await request.json());const {id}=await params;const closure=mapClosure(await closeShiftTransaction(id,actor,input));return NextResponse.json({data:{turno:{id:closure.shiftId,status:"CLOSED",closedAt:closure.actualCloseAt},cierre:closure,asignacion:{id:closure.assignmentId,numberFrom:closure.numberFrom,numberTo:closure.numberTo,assignedSpaces:closure.assignedSpaces},resumenOperacional:{collectedAmount:closure.collectedAmount,paidVehicles:closure.paidVehicles,pendingVehicles:closure.pendingVehicles,cancelledVehicles:closure.cancelledVehicles}}});}catch(error){return failure(error);}}
