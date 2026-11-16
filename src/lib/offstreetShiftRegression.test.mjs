import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shiftDisplay } from "./shiftDisplay.mjs";
import { hasPermission, PERMISSIONS, ROLES } from "./auth/permissions.mjs";
import { OPERATIONAL_SOURCE_ERROR, sanitizeClosureInput, ShiftClosureError } from "./shiftClosure.mjs";

const read = p => readFileSync(new URL(p, import.meta.url), "utf8");
// Execute the real service with its Next.js-only marker removed.
const serviceSource = read("./posOperatorShiftService.js").replace('import "server-only";', "")
  .replace('"./posOperatorShiftCore.mjs"', JSON.stringify(new URL("./posOperatorShiftCore.mjs", import.meta.url).href));
const { loadOperatorShiftPreview } = await import(`data:text/javascript;base64,${Buffer.from(serviceSource).toString("base64")}`);
const shift = { id:"s1", parkingId:"p1", operatorId:"u1" };
test("crear Off Street sin asignación ni supervisor envía solicitud sin acceso nulo", async () => {
  const component=read("../components/estacionamientos/ParkingShiftsManager.js");
  const submitSource=component.slice(component.indexOf("  async function submit("),component.indexOf("  async function removeShift("));
  const errors=[],saving=[];let submitted,reset=false;
  const dependencies={selectedAssignment:null,allowOffStreetDirectOperator:true,
    form:{operatorId:"operador-ficticio",assignmentId:"",supervisorId:"",date:"2026-10-08",scheduledStart:"07:00",scheduledEnd:"17:00",status:"PROGRAMMED",notes:""},
    parking:{code:"FICTICIO"},editingShiftId:"",setFormError:error=>errors.push(error),setSaving:value=>saving.push(value),
    authenticatedFetch:async(url,options)=>{submitted={url,payload:JSON.parse(options.body)};return {ok:true,json:async()=>({data:{id:"turno-ficticio"}})};},
    setShifts:update=>assert.equal(update([])[0].id,"turno-ficticio"),resetForm:()=>{reset=true;}};
  const submit=new Function(...Object.keys(dependencies),`${submitSource};return submit;`)(...Object.values(dependencies));
  await submit({preventDefault(){}});
  assert.deepEqual(errors,[""]);assert.deepEqual(saving,[true,false]);assert.equal(reset,true);
  assert.equal(submitted.url,"/api/estacionamientos/FICTICIO/turnos");
  assert.equal(submitted.payload.operatorId,"operador-ficticio");
  assert.equal(Object.hasOwn(submitted.payload,"supervisorId"),false);
});
function source(rows, errorPage = -1) {
  return { from() {
    const filters = [];
    const q = { select:()=>q, eq:(k,v)=>{filters.push([k,v]);return q;},order:()=>q,
      range:(from,to)=>Promise.resolve(from === errorPage ? {error:{code:"SOURCE_FAILED"}} : {data:rows.filter(r=>filters.every(([k,v])=>r[k]===v)).slice(from,to+1)}) };
    return q;
  } };
}
test("vista previa distingue fuente vacía de consulta fallida", async () => {
  assert.equal((await loadOperatorShiftPreview(source([]),shift)).grossAmount,0);
  await assert.rejects(loadOperatorShiftPreview(source([],0),shift),{code:"SOURCE_FAILED"});
});
test("vista previa incluye más de 1000 pagos y pendientes de turnos anteriores", async () => {
  const rows = Array.from({length:1201},(_,i)=>({id:`m${i}`,parking_id:"p1",payment_shift_id:"s1",exit_operator_id:"u1",status:"PAID",payment_method:i%2 ? "CARD":"CASH",total_amount:100}));
  rows.push({id:"old",parking_id:"p1",status:"OPEN"},{id:"foreign",parking_id:"p2",status:"OPEN"});
  const preview=await loadOperatorShiftPreview(source(rows),shift);
  assert.equal(preview.grossAmount,120100); assert.equal(preview.confirmedPaymentsCount,1201); assert.equal(preview.pendingVehiclesCount,1);
});
test("página posterior fallida y cobrador inconsistente rechazan resumen", async () => {
  const rows=Array.from({length:501},()=>({parking_id:"p1",payment_shift_id:"s1",exit_operator_id:"u1",status:"PAID",total_amount:100}));
  await assert.rejects(loadOperatorShiftPreview(source(rows,500),shift),{code:"SOURCE_FAILED"});
  await assert.rejects(loadOperatorShiftPreview(source([{...rows[0],exit_operator_id:"other"}]),shift),/SHIFT_PAYMENT_TRACE_MISMATCH/);
});
test("presentación común muestra nombre y explica base Off Street sin capacidad ficticia", () => {
  const view=shiftDisplay({parking:{type:"OFF_STREET"},assignment:{max_vehicles:1},operatorName:"Operador ficticio"});
  assert.equal(view.operatorName,"Operador ficticio"); assert.equal(view.areaLabel,"Operación general Off Street");
  assert.match(view.assignmentExplanation,/no representa la capacidad/); assert.doesNotMatch(view.spacesLabel,/1 plaza/);
  assert.equal(shiftDisplay({parking:{type:"ON_STREET"},assignment:{max_vehicles:1}}).spacesLabel,"1 plaza asignada");
});
test("solo administradores poseen permiso de eliminación", () => {
  assert.equal(hasPermission(ROLES.PLATFORM_ADMIN,PERMISSIONS.PARKINGS_MANAGE),true);
  assert.equal(hasPermission(ROLES.COMPANY_ADMIN,PERMISSIONS.PARKINGS_MANAGE),true);
  assert.equal(hasPermission(ROLES.OPERATOR,PERMISSIONS.PARKINGS_MANAGE),false);
  assert.equal(hasPermission(ROLES.INSPECTOR,PERMISSIONS.PARKINGS_MANAGE),false);
});
test("listado y cierre resuelven nombre con empresa tanto mapeada como persistida", async () => {
  const source=read("./shiftPresentationRepository.js").replace('import "server-only";',"")
    .replace('"./shiftDisplay.mjs"',JSON.stringify(new URL("./shiftDisplay.mjs",import.meta.url).href));
  const {loadShiftPresentations}=await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const queries=[];
  const db={from(table){
    const q={select:()=>q,eq:(column,value)=>{queries.push({table,column,value});return q;},in:()=>q,
      then:resolve=>resolve({data:table === "company_members" ? [{user_id:"u1",full_name:"Operador ficticio"}] : []})};
    return q;
  }};
  for(const parking of [{id:"p1",type:"OFF_STREET",companyId:"c1"},{id:"p1",type:"OFF_STREET",company_id:"c1"}]) {
    const [row]=await loadShiftPresentations(db,parking,[{operator_id:"u1"}]);
    assert.equal(row.presentation.operatorName,"Operador ficticio");
    assert.equal(row.presentation.areaLabel,"Operación general Off Street");
  }
  assert.equal(queries.filter(q=>q.table === "company_members" && q.column === "company_id").every(q=>q.value === "c1"),true);
  await assert.rejects(loadShiftPresentations(db,{id:"p1"},[]),/SHIFT_COMPANY_RELATION_MISSING/);
});
test("DELETE verifica filas y traduce la carrera de estado a conflicto HTTP", async () => {
  const src=read("../app/api/estacionamientos/[id]/turnos/[turnoId]/route.js").replace(/^import .*;\r?\n/gm,"").replaceAll("export async function","async function");
  let affected=[];
  const q={delete:()=>q,eq:()=>q,is:()=>q,select:async()=>({data:affected})};
  const dependencies={NextResponse:{json:(body,options={})=>({body,status:options.status||200})},PERMISSIONS,ROLES,
    authorizeOperationRequest:async()=>({db:{from:()=>q},context:{role:ROLES.COMPANY_ADMIN},scope:{}}),
    requireOperationalParking:async()=>({id:"p1"}),requireOperationalShift:async()=>({id:"s1",status:"PROGRAMMED"}),
    operationAuthorizationError:()=>null,operationalError:()=>({status:500})};
  const handler=new Function(...Object.keys(dependencies),`${src};return DELETE;`)(...Object.values(dependencies));
  const params={params:Promise.resolve({id:"p1",turnoId:"s1"})};
  assert.equal((await handler({},params)).status,409);
  affected=[{id:"s1"}];assert.equal((await handler({},params)).body.data.deleted,true);
});
test("API de cierre consulta POS y devuelve error de fuente separado de un turno vacío", async () => {
  const src=read("../app/api/turnos/[id]/cerrar/route.js").replace(/^import .*;\r?\n/gm,"").replaceAll("export async function","async function");
  let fail=false,confirmedActor;
  const logs=[];
  const context={shift,parking:{type:"OFF_STREET"},operator:{name:"Operador ficticio"}};
  const dependencies={console:{error:(...args)=>logs.push(args)},NextResponse:{json:(body,options={})=>({body,status:options.status||200})},PERMISSIONS,
    OPERATIONAL_SOURCE_ERROR,sanitizeClosureInput,ShiftClosureError,
    authorizeOperationRequest:async()=>({db:{},context:{},scope:{}}),requireOperationalShift:async()=>shift,
    operationAuthorizationError:()=>null,operationActor:()=>({id:"admin",name:"Administrador",isAdmin:true}),
    getShiftContext:async()=>context,loadOperatorShiftPreview:async()=>{if(fail)throw {code:"SOURCE_FAILED"};return {grossAmount:0,confirmedPaymentsCount:0,pendingVehiclesCount:0,cancelledPaymentsCount:0};},
    closeShiftTransaction:async(id,actor)=>{confirmedActor=actor;return {shiftId:id,id:"closure1"};},mapClosure:row=>row};
  const api=new Function(...Object.keys(dependencies),`${src};return {GET,POST};`)(...Object.values(dependencies));
  const params={params:Promise.resolve({id:"s1"})};
  const empty=await api.GET({},params);assert.equal(empty.body.data.summary.collectedAmount,0);assert.equal(empty.body.data.summaryError,null);
  fail=true;const failure=await api.GET({},params);assert.equal(failure.body.data.summary,null);assert.equal(failure.body.data.summaryError.code,"OPERATIONAL_DATA_SOURCE_UNAVAILABLE");
  assert.equal(logs[0][1].code,"SOURCE_FAILED");
  await api.POST({json:async()=>({confirm:true})},params);
  assert.equal(confirmedActor.id,"admin");assert.equal(confirmedActor.name,"Operador ficticio");
});
