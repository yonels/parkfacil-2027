export const OPERATIONAL_SOURCE_ERROR = "No es posible cerrar el turno porque todavía no existe una fuente operacional persistente para calcular pagos, vehículos pendientes y anulaciones.";
export class ShiftClosureError extends Error { constructor(code,message,status=400){super(message);this.code=code;this.status=status;} }
export function sanitizeClosureInput(input={}) {
  if (input.confirm !== true) throw new ShiftClosureError("CLOSURE_CONFIRMATION_REQUIRED","Debes confirmar el cierre definitivo.");
  return { observations:String(input.observations??"").trim().slice(0,1000),confirm:true };
}
export function calculateShiftTotals({payments,movements,shift,assignment}) {
  if(!Array.isArray(payments)||!Array.isArray(movements)) throw new ShiftClosureError("OPERATIONAL_DATA_SOURCE_UNAVAILABLE",OPERATIONAL_SOURCE_ERROR,503);
  const valid=payments.filter(p=>p.status==="PROCESSED"&&p.collectedInShiftId===shift.id&&p.collectedByOperatorId===shift.operatorId);
  const paidIds=new Set(valid.map(p=>p.movementId));
  const area=movements.filter(m=>m.parkingId===shift.parkingId&&m.sectorId===assignment.sectorId&&m.streetId===assignment.streetId);
  return {collectedAmount:valid.reduce((sum,p)=>sum+Number(p.amount||0),0),paidVehicles:paidIds.size,pendingVehicles:area.filter(m=>m.status==="PENDING_PAYMENT"&&!paidIds.has(m.id)).length,cancelledVehicles:area.filter(m=>m.status==="CANCELLED"&&m.cancelledInShiftId===shift.id).length};
}
export function canViewClosure(actor,closure){return Boolean(actor&&closure&&(actor.id===closure.operatorId||actor.isAdmin||actor.isSupervisor));}
export function receiptFromClosure(closure){if(!closure?.id||closure.closureStatus!=="CONFIRMED")throw new ShiftClosureError("CLOSURE_NOT_FOUND","El comprobante no existe.",404);return Object.freeze({...closure});}
