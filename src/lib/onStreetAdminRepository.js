import "server-only";
import { ROLES } from "./auth/permissions.mjs";
import { maskAdminPhone, normalizeOnStreetFilters, paymentTypeFromTransaction, visibleOnStreetStatus } from "./onStreetAdminCore.mjs";
import { computeKpis, extensionsBreakdown, locationRanking, minutesDistribution, operationalAlerts, resolveParkingCompanyFilter, resolvePeriodBounds, revenueByDay, sessionsByDay, sortLocationRanking, statusDistribution } from "./onStreetDashboardCore.mjs";
function fail(result){if(result.error)throw result.error;return result.data||[];}
// companyId: solo platform_admin puede pasarlo, para sub-filtrar el
// dashboard a una empresa específica (selector "Empresa" en Root). Para
// company_admin/operator se ignora — su alcance ya queda fijado por
// context.companyId, nunca por un parámetro que llegue del cliente. La
// decisión de qué companyId aplicar vive en resolveParkingCompanyFilter
// (onStreetDashboardCore.mjs, sin "server-only", testeada ahí).
export async function scopedParkings(db,context,companyId=null){let query=db.from("parkings").select("id,code,name,company_id,company_name").eq("type","ON_STREET").order("name");const resolvedCompanyId=resolveParkingCompanyFilter(context,companyId);if(resolvedCompanyId)query=query.eq("company_id",resolvedCompanyId);return fail(await query);}
async function locationData(db,ids){if(!ids.length)return{locations:[],areas:[],streets:[],segments:[]};const results=await Promise.all([db.from("on_street_qr_locations").select("id,public_code,label,parking_id,sector_id,street_id,segment_id,status,created_at").in("parking_id",ids),db.from("parking_sectors").select("id,parking_id,code,name").in("parking_id",ids),db.from("parking_streets").select("id,parking_id,sector_id,name").in("parking_id",ids),db.from("parking_street_segments").select("id,parking_id,area_id,street_id,code,name,street_side").in("parking_id",ids)]);return{locations:fail(results[0]),areas:fail(results[1]),streets:fail(results[2]),segments:fail(results[3])};}
const SIDE_LABELS={BOTH:"Ambos",EVEN:"Pares",ODD:"Impares"};
// La tarifa On Street no se guarda en on_street_qr_locations: se resuelve en
// vivo desde parking_rates (igual que en el pago real), preferiendo una
// tarifa específica del área sobre la general del estacionamiento. Evita
// duplicar/desincronizar el precio entre la ficha de la ubicación y el cobro.
async function activeRatesByParking(db,parkingIds){if(!parkingIds.length)return[];const now=new Date().toISOString();return fail(await db.from("parking_rates").select("id,parking_id,area_id,minute_amount,currency,valid_from,valid_until").in("parking_id",parkingIds).eq("billing_mode","EFFECTIVE_MINUTE").eq("status","ACTIVE").lte("valid_from",now).or(`valid_until.is.null,valid_until.gt.${now}`));}
function resolveRate(rates,parkingId,areaId){const candidates=rates.filter(r=>r.parking_id===parkingId);const forArea=candidates.find(r=>r.area_id===areaId);return forArea||candidates.find(r=>!r.area_id)||null;}
function maps(parkings,data){return{p:new Map(parkings.map(x=>[x.id,x])),l:new Map(data.locations.map(x=>[x.id,x])),a:new Map(data.areas.map(x=>[x.id,x])),s:new Map(data.streets.map(x=>[x.id,x])),g:new Map(data.segments.map(x=>[x.id,x]))};}
function locate(row,map){const location=map.l.get(row.qr_location_id||row.id),parking=map.p.get(row.parking_id||location?.parking_id),area=map.a.get(location?.sector_id),street=map.s.get(location?.street_id),segment=map.g.get(location?.segment_id);return{parking,area,street,segment,side:SIDE_LABELS[segment?.street_side]||"—",label:[street?.name,segment?.name].filter(Boolean).join(" / ")||parking?.name||"Ubicación no disponible"};}
function matches(location,filters){return(!filters.parkingId||location.parking?.id===filters.parkingId)&&(!filters.areaId||location.area?.id===filters.areaId)&&(!filters.streetId||location.street?.id===filters.streetId)&&(!filters.segmentId||location.segment?.id===filters.segmentId);}
function dayBounds(date){return date?[`${date}T00:00:00.000-04:00`,`${date}T23:59:59.999-04:00`]:null;}
export async function listOnStreetSessions(db,context,input={}){
  const filters=normalizeOnStreetFilters(input),parkings=await scopedParkings(db,context),ids=parkings.map(x=>x.id),data=await locationData(db,ids),options={parkings,areas:data.areas,streets:data.streets,segments:data.segments};if(!ids.length)return{rows:[],filters,options};
  // Sin filtrar por payment_transaction_id: muestra tanto las sesiones pagadas
  // (producto definitivo) como cualquier sesión antigua del piloto sin cobro
  // que aún exista, para no perder trazabilidad histórica en la
  // administración. La UI decide cómo representar cada caso (ver
  // visibleOnStreetStatus y la ausencia de expires_at).
  let query=db.from("on_street_pilot_sessions").select("id,operational_number,qr_location_id,parking_id,phone_normalized,status,started_at,expires_at,ended_at,purchased_minutes,amount_paid,simulated_amount,payment_transaction_id,created_at").in("parking_id",ids).order("started_at",{ascending:false}).limit(1000);const bounds=dayBounds(filters.date);if(bounds)query=query.gte("started_at",bounds[0]).lte("started_at",bounds[1]);const sessions=fail(await query),transactionIds=sessions.map(x=>x.payment_transaction_id).filter(Boolean),transactions=transactionIds.length?fail(await db.from("payment_transactions").select("id,provider,payment_type,provider_payment_type_code,status,buy_order,authorization_code,amount,committed_at").in("id",transactionIds)):[],transactionMap=new Map(transactions.map(x=>[x.id,x])),map=maps(parkings,data);
  const sessionIds=sessions.map(x=>x.id),extensionRows=sessionIds.length?fail(await db.from("on_street_pilot_extensions").select("session_id").in("session_id",sessionIds)):[],extensionCounts=new Map();for(const row of extensionRows)extensionCounts.set(row.session_id,(extensionCounts.get(row.session_id)||0)+1);
  const rows=sessions.map(session=>{const location=locate(session,map),transaction=transactionMap.get(session.payment_transaction_id)||null;return{...session,status:visibleOnStreetStatus(session),phone:maskAdminPhone(session.phone_normalized),amount:transaction?.status==="COMMITTED"?Number(session.amount_paid??transaction.amount):0,paymentType:paymentTypeFromTransaction(transaction),transaction,extensionCount:extensionCounts.get(session.id)||0,location};}).filter(row=>matches(row.location,filters));return{rows,filters,options};
}
export async function getOnStreetDashboard(db,context,input={}){const result=await listOnStreetSessions(db,context,input),rows=result.rows,total=rows.reduce((sum,row)=>sum+Number(row.purchased_minutes||0),0);return{...result,kpis:{activeSessions:rows.filter(row=>row.status==="ACTIVE"&&row.transaction?.status==="COMMITTED").length,operations:rows.length,revenue:rows.reduce((sum,row)=>sum+row.amount,0),averageMinutes:rows.length?Math.round(total/rows.length):0}};}
export async function listOnStreetPayments(db,context,input={}){
  const sessionData=await listOnStreetSessions(db,context,input),parkingIds=sessionData.options.parkings.map(x=>x.id);if(!parkingIds.length)return{...sessionData,rows:[]};const intents=fail(await db.from("on_street_payment_intents").select("id,public_token,parking_id,qr_location_id,resulting_session_id,operation_type,status,created_at").in("parking_id",parkingIds)),intentIds=intents.map(x=>x.id);if(!intentIds.length)return{...sessionData,rows:[]};let query=db.from("payment_transactions").select("id,source_id,provider,status,amount,currency,buy_order,payment_type,provider_payment_type_code,authorization_code,created_at,committed_at").in("source_id",intentIds).order("created_at",{ascending:false}).limit(1000);const bounds=dayBounds(sessionData.filters.date);if(bounds)query=query.gte("created_at",bounds[0]).lte("created_at",bounds[1]);const transactions=fail(await query),intentMap=new Map(intents.map(x=>[x.id,x])),sessionMap=new Map(sessionData.rows.map(x=>[x.id,x])),data=await locationData(db,parkingIds),map=maps(sessionData.options.parkings,data);const rows=transactions.map(transaction=>{const intent=intentMap.get(transaction.source_id),session=sessionMap.get(intent?.resulting_session_id),location=locate({qr_location_id:intent?.qr_location_id,parking_id:intent?.parking_id},map);return{...transaction,operationNumber:session?.operational_number||String(intent?.public_token||"").slice(0,8),sessionNumber:session?.operational_number||"Pendiente",paymentType:paymentTypeFromTransaction(transaction),location};}).filter(row=>matches(row.location,sessionData.filters));return{...sessionData,rows};
}
export async function listOnStreetLocations(db,context){
  const parkings=await scopedParkings(db,context),parkingIds=parkings.map(x=>x.id),data=await locationData(db,parkingIds),map=maps(parkings,data),rates=await activeRatesByParking(db,parkingIds);
  return{rows:data.locations.map(row=>{const location=locate(row,map),rate=resolveRate(rates,row.parking_id,row.sector_id);return{...row,location,rate:rate?{minuteAmount:Number(rate.minute_amount),currency:rate.currency}:null};}),options:{parkings,areas:data.areas,streets:data.streets,segments:data.segments}};
}

function assertOwnedParking(parking,context){
  if(!parking){const e=new Error("PARKING_NOT_FOUND");e.code="PARKING_NOT_FOUND";e.status=404;throw e;}
  // El backend resuelve y verifica la pertenencia por parking_id/company_id;
  // nunca se confía en un companyId enviado libremente por el cliente.
  if(context.role!==ROLES.PLATFORM_ADMIN&&parking.company_id!==context.companyId){const e=new Error("PARKING_NOT_FOUND");e.code="PARKING_NOT_FOUND";e.status=404;throw e;}
}

// Opciones para el formulario "Crear QR": estacionamientos On Street del
// alcance del usuario, con su jerarquía área/calle/tramo y la tarifa vigente
// resuelta para cada combinación estacionamiento+área (o solo estacionamiento
// si la tarifa no está segmentada por área), marcando qué tramos ya tienen
// una ubicación QR (segment_id es único en on_street_qr_locations).
export async function listOnStreetLocationOptions(db,context){
  const parkings=await scopedParkings(db,context),parkingIds=parkings.map(p=>p.id);
  if(!parkingIds.length)return{parkings:[],areas:[],streets:[],segments:[]};
  const{areas,streets,segments}=await locationData(db,parkingIds).then(d=>({areas:d.areas,streets:d.streets,segments:d.segments}));
  const existing=fail(await db.from("on_street_qr_locations").select("segment_id").in("parking_id",parkingIds));
  const usedSegmentIds=new Set(existing.map(r=>r.segment_id));
  const rates=await activeRatesByParking(db,parkingIds);
  const companies=await companiesByIds(db,[...new Set(parkings.map(p=>p.company_id))]);
  const companyMap=new Map(companies.map(c=>[c.id,c]));
  return{
    parkings:parkings.map(p=>{const company=companyMap.get(p.company_id);return{id:p.id,code:p.code,name:p.name,companyId:p.company_id,companyName:p.company_name,operator:{tradeName:company?.trade_name||p.company_name,businessName:company?.business_name||p.company_name,rut:company?.rut_number?`${company.rut_number}-${company.rut_dv}`:null,email:company?.email||null,phone:company?.phone||null}};}),
    areas:areas.map(a=>({id:a.id,parkingId:a.parking_id,code:a.code,name:a.name,rate:(()=>{const r=resolveRate(rates,a.parking_id,a.id);return r?{minuteAmount:Number(r.minute_amount),currency:r.currency}:null;})()})),
    streets:streets.map(s=>({id:s.id,parkingId:s.parking_id,sectorId:s.sector_id,name:s.name})),
    segments:segments.map(s=>({id:s.id,parkingId:s.parking_id,areaId:s.area_id,streetId:s.street_id,code:s.code,name:s.name,side:SIDE_LABELS[s.street_side]||"—",hasQr:usedSegmentIds.has(s.id)})),
  };
}

// Crea una ubicación QR. Revalida en servidor que el estacionamiento
// pertenezca a la empresa del solicitante (o que sea Root) antes de insertar;
// el trigger validate_on_street_qr_location ya existente en la base de datos
// valida además la consistencia de la jerarquía área/calle/tramo/estacionamiento.
// No guarda rate_id: la tarifa se resuelve en vivo (ver activeRatesByParking),
// igual que en el cobro real, para no desincronizar precios.
export async function createOnStreetQrLocation(db,context,{parkingId,sectorId,streetId,segmentId,label,status}){
  const parking=await db.from("parkings").select("id,company_id").eq("id",parkingId).eq("type","ON_STREET").maybeSingle().then(r=>{if(r.error)throw r.error;return r.data;});
  assertOwnedParking(parking,context);
  const inserted=await db.from("on_street_qr_locations").insert({parking_id:parkingId,sector_id:sectorId,street_id:streetId,segment_id:segmentId,label:String(label||"").trim(),status}).select("id,public_code,status,label,parking_id,sector_id,street_id,segment_id,created_at").single();
  if(inserted.error){
    if(inserted.error.code==="23505"){const e=new Error("SEGMENT_ALREADY_HAS_QR");e.code="SEGMENT_ALREADY_HAS_QR";e.status=409;throw e;}
    if(inserted.error.code==="23514"||inserted.error.message?.includes("QR_LOCATION_HIERARCHY_INVALID")){const e=new Error("QR_LOCATION_HIERARCHY_INVALID");e.code="QR_LOCATION_HIERARCHY_INVALID";e.status=400;throw e;}
    throw inserted.error;
  }
  return inserted.data;
}

// Edita nombre/estado. No permite reasignar estacionamiento/área/calle/tramo:
// rompería la trazabilidad histórica de las sesiones ya asociadas.
export async function updateOnStreetQrLocation(db,context,id,{label,status}){
  const current=await db.from("on_street_qr_locations").select("id,parking_id").eq("id",id).maybeSingle().then(r=>{if(r.error)throw r.error;return r.data;});
  if(!current){const e=new Error("LOCATION_NOT_FOUND");e.code="LOCATION_NOT_FOUND";e.status=404;throw e;}
  const parking=await db.from("parkings").select("id,company_id").eq("id",current.parking_id).maybeSingle().then(r=>{if(r.error)throw r.error;return r.data;});
  assertOwnedParking(parking,context);
  const patch={};
  if(label!==undefined)patch.label=String(label||"").trim();
  if(status!==undefined)patch.status=status;
  if(!Object.keys(patch).length){const e=new Error("NO_CHANGES");e.code="NO_CHANGES";e.status=400;throw e;}
  const updated=await db.from("on_street_qr_locations").update(patch).eq("id",id).select("id,public_code,status,label,parking_id,sector_id,street_id,segment_id,created_at").single();
  if(updated.error)throw updated.error;
  return updated.data;
}
async function companiesByIds(db,companyIds){if(!companyIds.length)return[];return fail(await db.from("companies").select("id,trade_name,business_name,rut_number,rut_dv,email,phone").in("id",companyIds));}

// Ficha completa de una única ubicación QR: jerarquía real, tarifa vigente
// resuelta en vivo y datos de contacto del operador (para el letrero
// imprimible). Aplica el mismo aislamiento por empresa que el resto del
// módulo (assertOwnedParking): nunca confía en el id recibido sin
// verificar la pertenencia en el servidor.
export async function getOnStreetLocationDetail(db,context,id){
  const location=await db.from("on_street_qr_locations").select("id,public_code,label,status,parking_id,sector_id,street_id,segment_id,created_at").eq("id",id).maybeSingle().then(r=>{if(r.error)throw r.error;return r.data;});
  if(!location)return null;
  const parking=await db.from("parkings").select("id,code,name,company_id,company_name").eq("id",location.parking_id).maybeSingle().then(r=>{if(r.error)throw r.error;return r.data;});
  assertOwnedParking(parking,context);
  const[area,street,segment,rates,companies]=await Promise.all([
    db.from("parking_sectors").select("id,code,name").eq("id",location.sector_id).maybeSingle().then(r=>{if(r.error)throw r.error;return r.data;}),
    db.from("parking_streets").select("id,name").eq("id",location.street_id).maybeSingle().then(r=>{if(r.error)throw r.error;return r.data;}),
    db.from("parking_street_segments").select("id,code,name,street_side").eq("id",location.segment_id).maybeSingle().then(r=>{if(r.error)throw r.error;return r.data;}),
    activeRatesByParking(db,[location.parking_id]),
    companiesByIds(db,[parking.company_id]),
  ]);
  const rate=resolveRate(rates,location.parking_id,location.sector_id);
  const company=companies[0]||null;
  return{
    id:location.id,publicCode:location.public_code,label:location.label||"",status:location.status,createdAt:location.created_at,
    parking:{id:parking.id,code:parking.code,name:parking.name},
    area:area?{id:area.id,code:area.code,name:area.name}:null,
    street:street?{id:street.id,name:street.name}:null,
    segment:segment?{id:segment.id,code:segment.code,name:segment.name,side:SIDE_LABELS[segment.street_side]||"—"}:null,
    rate:rate?{minuteAmount:Number(rate.minute_amount),currency:rate.currency}:null,
    operator:{
      companyName:parking.company_name,
      tradeName:company?.trade_name||parking.company_name,
      businessName:company?.business_name||parking.company_name,
      rut:company?.rut_number?`${company.rut_number}-${company.rut_dv}`:null,
      email:company?.email||null,
      phone:company?.phone||null,
    },
  };
}

export async function getOnStreetSessionDetail(db,context,id){const listed=await listOnStreetSessions(db,context,{}),session=listed.rows.find(row=>row.id===id);if(!session)return null;const extensions=fail(await db.from("on_street_pilot_extensions").select("id,additional_minutes,simulated_amount,previous_expires_at,new_expires_at,payment_transaction_id,created_at").eq("session_id",id).order("created_at")),paymentIds=[session.payment_transaction_id,...extensions.map(x=>x.payment_transaction_id)].filter(Boolean),transactions=paymentIds.length?fail(await db.from("payment_transactions").select("id,source_id,provider,status,amount,currency,buy_order,payment_type,provider_payment_type_code,authorization_code,created_at,redirected_at,committed_at,failed_at").in("id",paymentIds)):[];return{session,extensions,transactions};}

// Dashboard On Street: KPIs, series y rankings reales (no genera datos
// ficticios). Reutiliza scopedParkings/locationData/maps/locate ya
// existentes; delega todo el cálculo a onStreetDashboardCore.mjs (puro,
// testeable sin Supabase). companyId solo aplica para platform_admin (ver
// scopedParkings) — company_admin/operator siempre quedan acotados por
// context.companyId, nunca por lo que envíe el cliente.
// Núcleo de datos compartido entre el Dashboard y los Reportes On Street —
// una sola consulta real por período/alcance, sin duplicar entre ambos.
// company_admin/operator: scopedParkings ya acota parkingIds a su propia
// empresa antes de que se ejecute cualquier otra consulta aquí, así que
// ninguna de las tablas siguientes (sesiones, extensiones, pagos) puede
// devolver datos de otra empresa.
async function fetchOnStreetScopedData(db,context,input={}){
  const bounds=resolvePeriodBounds(input.period||"today",{from:input.from,to:input.to});
  const parkings=await scopedParkings(db,context,input.companyId||null);
  const companies=context.role===ROLES.PLATFORM_ADMIN?await companiesByIds(db,[...new Set(parkings.map(p=>p.company_id))]):[];
  const filterOptions={parkings,companies:companies.map(c=>({id:c.id,name:c.trade_name||c.business_name}))};
  const filters={parkingId:input.parkingId||null,areaId:input.areaId||null,streetId:input.streetId||null,segmentId:input.segmentId||null};
  if(!parkings.length||!bounds){
    return{bounds,filters,filterOptions,parkingIds:[],map:maps([],{locations:[],areas:[],streets:[],segments:[]}),sessions:[],extensions:[],paymentAttempts:[],activeSessionsNow:0,areas:[],streets:[],segments:[]};
  }
  const scopedIds=parkings.map(p=>p.id);
  const parkingIds=input.parkingId&&scopedIds.includes(input.parkingId)?[input.parkingId]:scopedIds;
  const data=await locationData(db,parkingIds),map=maps(parkings,data);

  const activeSessionsNowResult=await db.from("on_street_pilot_sessions").select("id",{count:"exact",head:true}).in("parking_id",parkingIds).eq("status","ACTIVE");
  if(activeSessionsNowResult.error)throw activeSessionsNowResult.error;
  const activeSessionsNow=activeSessionsNowResult.count||0;

  const sessionsRaw=fail(await db.from("on_street_pilot_sessions").select("id,operational_number,qr_location_id,parking_id,phone_normalized,status,started_at,expires_at,ended_at,purchased_minutes,amount_paid,payment_transaction_id").in("parking_id",parkingIds).gte("started_at",bounds.from).lte("started_at",bounds.to).order("started_at",{ascending:false}).limit(2000));
  const sessions=sessionsRaw.map(row=>({...row,location:locate(row,map)})).filter(row=>matches(row.location,filters));
  const sessionIds=sessions.map(s=>s.id);
  const sessionMap=new Map(sessions.map(s=>[s.id,s]));

  const extensions=sessionIds.length?fail(await db.from("on_street_pilot_extensions").select("id,session_id,additional_minutes,payment_transaction_id,created_at").in("session_id",sessionIds)):[];

  const intents=fail(await db.from("on_street_payment_intents").select("id,parking_id,qr_location_id,operation_type,resulting_session_id,target_session_id").in("parking_id",parkingIds).gte("created_at",bounds.from).lte("created_at",bounds.to));
  const intentMap=new Map(intents.map(i=>[i.id,i]));
  const intentIds=intents.map(i=>i.id);
  const paymentAttempts=intentIds.length?fail(await db.from("payment_transactions").select("id,source_id,status,amount,currency,buy_order,authorization_code,created_at,committed_at").in("source_id",intentIds)):[];

  return{bounds,filters,filterOptions,parkingIds,map,sessions,sessionMap,extensions,intents,intentMap,paymentAttempts,activeSessionsNow,areas:data.areas,streets:data.streets,segments:data.segments};
}

export async function getOnStreetDashboardOverview(db,context,input={}){
  const scoped=await fetchOnStreetScopedData(db,context,input);
  if(!scoped.parkingIds.length||!scoped.bounds){
    return{
      period:input.period||"today",bounds:scoped.bounds,
      kpis:computeKpis({sessions:[],extensions:[],paymentAttempts:[],activeSessionsNow:0}),
      sessionsByDay:[],revenueByDay:[],minutesDistribution:minutesDistribution([]),
      extensions:extensionsBreakdown([],[]),statusDistribution:statusDistribution([]),
      locationRanking:[],alerts:[],activeSessions:[],
      options:{...scoped.filterOptions,areas:[],streets:[],segments:[]},
    };
  }
  const{bounds,sessions,extensions,paymentAttempts,activeSessionsNow}=scoped;
  const kpis=computeKpis({sessions,extensions,paymentAttempts,activeSessionsNow});
  const activePreview=sessions.filter(s=>visibleOnStreetStatus(s)==="ACTIVE").slice(0,20).map(s=>({...s,phone:maskAdminPhone(s.phone_normalized)}));

  return{
    period:input.period||"today",bounds,
    kpis,
    sessionsByDay:sessionsByDay(sessions,bounds.from,bounds.to),
    revenueByDay:revenueByDay(sessions,bounds.from,bounds.to),
    minutesDistribution:minutesDistribution(sessions),
    extensions:extensionsBreakdown(sessions,extensions),
    statusDistribution:statusDistribution(sessions),
    locationRanking:sortLocationRanking(locationRanking(sessions,extensions,(s)=>s.location),input.sortBy),
    alerts:operationalAlerts({paymentAttempts,sessions}),
    activeSessions:activePreview,
    options:{...scoped.filterOptions,areas:scoped.areas,streets:scoped.streets,segments:scoped.segments},
  };
}

// Reportes On Street: consulta histórica con detalle exportable (a
// diferencia del Dashboard, que resume). Mismo aislamiento por empresa
// (fetchOnStreetScopedData), mismo período/filtros. "type" determina qué
// tabla de detalle se arma — todas a partir de los mismos datos ya
// aislados, sin una segunda consulta insegura.
export async function getOnStreetReport(db,context,input={}){
  const scoped=await fetchOnStreetScopedData(db,context,input);
  const base={bounds:scoped.bounds,options:{...scoped.filterOptions,areas:scoped.areas,streets:scoped.streets,segments:scoped.segments}};
  if(!scoped.parkingIds.length||!scoped.bounds)return{...base,type:input.type||"sesiones",rows:[]};

  const{sessions,extensions,paymentAttempts,intents,sessionMap,map}=scoped;
  const type=input.type||"sesiones";

  if(type==="sesiones"){
    return{...base,type,rows:sessions.map(s=>({...s,phone:maskAdminPhone(s.phone_normalized),status:visibleOnStreetStatus(s),ubicacion:s.location?.label||"—",extensionCount:extensions.filter(e=>e.session_id===s.id).length}))};
  }
  if(type==="pagos"){
    const rows=paymentAttempts.map(t=>{
      const intent=intentMapFor(intents,t.source_id);
      const location=locate({qr_location_id:intent?.qr_location_id,parking_id:intent?.parking_id},map);
      const session=intent?.resulting_session_id?sessionMap.get(intent.resulting_session_id):intent?.target_session_id?sessionMap.get(intent.target_session_id):null;
      return{...t,operationType:intent?.operation_type||"—",ubicacion:location.label,sessionNumber:session?.operational_number||"—"};
    });
    return{...base,type,rows};
  }
  if(type==="ubicaciones"){
    return{...base,type,rows:sortLocationRanking(locationRanking(sessions,extensions,(s)=>s.location),input.sortBy)};
  }
  if(type==="extensiones"){
    const rows=extensions.map(e=>{
      const session=sessionMap.get(e.session_id);
      const transaction=session?paymentAttempts.find(t=>t.id===e.payment_transaction_id):null;
      return{...e,operational_number:session?.operational_number||"—",ubicacion:session?.location?.label||"—",amount:transaction?.status==="COMMITTED"?Number(transaction.amount):0};
    });
    return{...base,type,rows};
  }
  // "operadores" y "sms" no se implementan aquí: no existe hoy un campo de
  // atribución real de operador por sesión, y las estadísticas SMS no
  // deben simularse (ver onStreetPilotNotifications / instrucción del
  // brief) — el frontend debe mostrar el estado "Disponible al activar…"
  // en vez de pedir este "type".
  return{...base,type,rows:[]};
}
function intentMapFor(intents,id){return intents.find(i=>i.id===id)||null;}

// Empresas con operación On Street realmente asignadas al alcance del
// usuario autenticado (reutiliza scopedParkings/companiesByIds ya
// existentes). Usado para acotar los listados de Administradores/
// Operadores del árbol On Street a las empresas que corresponden — no
// crea un catálogo de empresas paralelo.
export async function listOnStreetCompanies(db,context){
  const parkings=await scopedParkings(db,context);
  const companyIds=[...new Set(parkings.map(p=>p.company_id))];
  const companies=await companiesByIds(db,companyIds);
  return companies.map(c=>({id:c.id,name:c.trade_name||c.business_name}));
}
