import "server-only";
import { ROLES } from "./auth/permissions.mjs";
import { maskAdminPhone, normalizeOnStreetFilters, paymentTypeFromTransaction, visibleOnStreetStatus } from "./onStreetAdminCore.mjs";
import { applySortAndPaginate, computeKpis, durationDistribution, extensionsBreakdown, locationRanking, minutesDistribution, occupancyRate, operationalAlerts, paymentMethodBreakdown, paymentRevenueByGroup, paymentsByDay, placePerformanceRanking, resolveParkingCompanyFilter, resolvePeriodBounds, revenueBreakdown, revenueByDay, revenueByHourOfDay, revenueTimeSeries, segmentCapacity, sessionsByHourOfDay, sessionStateBreakdown, sessionsByDay, soonToExpireCount, sortLocationRanking, sortPlacePerformance, statusDistribution } from "./onStreetDashboardCore.mjs";
import { computeInspectionKpis, emptyInspectionKpis } from "./onStreetInspectionsAdminCore.mjs";
function fail(result){if(result.error)throw result.error;return result.data||[];}
// CORRECCIÓN "Reportes On Street -> Pagos: No fue posible cargar el
// reporte" (2026-08-30). Causa raíz real (confirmada reproduciendo la
// consulta contra Supabase LOCAL): PostgREST expone `.in(columna,valores)`
// como parámetro de query string -- con `sessionIds` cercano al techo
// REPORT_ROW_CAP=1000 (ver más abajo; el entorno local ya acumula miles de
// sesiones de pruebas previas) esa URL supera el límite real de la
// plataforma y el fetch lanza "URI too long", que el catch de la ruta
// (`/api/on-street-qr/reportes`) traduce al mensaje genérico "No fue
// posible cargar el reporte." -- el error real nunca llegaba a la consola
// ni a la respuesta HTTP, solo a los logs del servidor (`console.error`).
// No es una regresión de los gráficos de Pagos ni de Crédito/Débito: el
// fetch de sesiones/extensiones (fetchOnStreetScopedData) corre ANTES de
// bifurcar por tipo de reporte, así que afecta a Sesiones/Pagos/Rendimiento
// por lugar/Extensiones por igual en cuanto el volumen de sesiones del
// período supera este umbral -- se corrige aquí, en el punto compartido,
// trocando el `.in()` en lotes (mismo resultado exacto, sin cambiar
// filtros ni columnas, cada id aparece en un único lote así que no hay
// riesgo de duplicados).
const IN_CHUNK_SIZE=200;
async function selectInChunks(makeQuery,ids){
  if(!ids.length)return[];
  const chunks=[];
  for(let i=0;i<ids.length;i+=IN_CHUNK_SIZE)chunks.push(ids.slice(i,i+IN_CHUNK_SIZE));
  const results=await Promise.all(chunks.map(chunk=>makeQuery(chunk)));
  return results.flatMap(r=>fail(r));
}
// Techo real del alcance completo que Dashboard/Reportes traen a memoria
// para calcular KPIs/Resumen/Excel y paginar en servidor (§7/§8 de la
// auditoría 2026-08-28).
//
// HALLAZGO DURANTE LA PRUEBA DE VOLUMEN (ver scripts/local-on-street-
// volume-e2e.mjs): subir este número por sí solo NO tiene efecto real.
// Supabase/PostgREST tiene su propio techo global "max_rows" (ver
// supabase/config.toml, db.max_rows=1000) que trunca CUALQUIER respuesta
// REST -- de cualquier tabla, de cualquier módulo del proyecto, no solo
// On Street -- a 1000 filas, sin importar el .limit() pedido desde el
// cliente. Antes de esta auditoría el código pedía .limit(2000) creyendo
// obtener hasta 2000 filas; en realidad SIEMPRE estuvo limitado a 1000 por
// esta configuración de plataforma. Se documenta aquí con el valor real
// (1000) en vez de mantener un número que sugiere una capacidad que el
// sistema no tiene.
//
// Elevar max_rows es una decisión de alcance mayor al de este módulo (es
// una configuración global de la API REST, afecta a todos los módulos del
// proyecto) y queda explícitamente PENDIENTE/fuera de esta tarea -- ver
// informe. La solución de fondo para escalar más allá de 1000 filas por
// consulta filtrada es migrar el cálculo de KPIs/Resumen a agregación SQL
// (RPC con GROUP BY/SUM en la base de datos, en vez de traer filas a Node)
// y, para el listado paginado en sí, usar .range() de Postgres directamente
// (LIMIT/OFFSET real en base de datos) en vez de traer el conjunto completo
// y paginar en memoria -- ninguna de las dos requiere tocar max_rows,
// porque cada página pedida (25/50/100 filas) siempre está muy por debajo
// del techo. No se reescribe aquí por ser un cambio de arquitectura mayor
// que "agregar paginación" -- documentado como pendiente.
const REPORT_ROW_CAP=1000;
// companyId: solo platform_admin puede pasarlo, para sub-filtrar el
// dashboard a una empresa específica (selector "Empresa" en Root). Para
// company_admin/operator se ignora — su alcance ya queda fijado por
// context.companyId, nunca por un parámetro que llegue del cliente. La
// decisión de qué companyId aplicar vive en resolveParkingCompanyFilter
// (onStreetDashboardCore.mjs, sin "server-only", testeada ahí).
export async function scopedParkings(db,context,companyId=null){let query=db.from("parkings").select("id,code,name,company_id,company_name").eq("type","ON_STREET").order("name");const resolvedCompanyId=resolveParkingCompanyFilter(context,companyId);if(resolvedCompanyId)query=query.eq("company_id",resolvedCompanyId);return fail(await query);}
// "capacity/right_capacity/left_capacity" (§6 de la auditoría 2026-08-28):
// dato real de ocupación, agregado en 20260731173000_on_street_spaces_and_
// zones.sql -- se incluye aquí (no en una consulta aparte) porque
// locationData ya trae los tramos para toda la jerarquía; segmentCapacity()
// decide cuál campo usar (o null si no hay dato).
async function locationData(db,ids){if(!ids.length)return{locations:[],areas:[],streets:[],segments:[]};const results=await Promise.all([db.from("on_street_qr_locations").select("id,public_code,label,parking_id,sector_id,street_id,segment_id,status,created_at").in("parking_id",ids),db.from("parking_sectors").select("id,parking_id,code,name").in("parking_id",ids),db.from("parking_streets").select("id,parking_id,sector_id,name").in("parking_id",ids),db.from("parking_street_segments").select("id,parking_id,area_id,street_id,code,name,street_side,capacity,right_capacity,left_capacity,sort_order").in("parking_id",ids)]);return{locations:fail(results[0]),areas:fail(results[1]),streets:fail(results[2]),segments:fail(results[3])};}
const SIDE_LABELS={BOTH:"Ambos",EVEN:"Pares",ODD:"Impares"};
// La tarifa On Street no se guarda en on_street_qr_locations: se resuelve en
// vivo desde parking_rates (igual que en el pago real), preferiendo una
// tarifa específica del área sobre la general del estacionamiento. Evita
// duplicar/desincronizar el precio entre la ficha de la ubicación y el cobro.
async function activeRatesByParking(db,parkingIds){if(!parkingIds.length)return[];const now=new Date().toISOString();return fail(await db.from("parking_rates").select("id,parking_id,area_id,name,minute_amount,currency,valid_from,valid_until").in("parking_id",parkingIds).eq("billing_mode","EFFECTIVE_MINUTE").eq("status","ACTIVE").lte("valid_from",now).or(`valid_until.is.null,valid_until.gt.${now}`));}
function resolveRate(rates,parkingId,areaId){const candidates=rates.filter(r=>r.parking_id===parkingId);const forArea=candidates.find(r=>r.area_id===areaId);return forArea||candidates.find(r=>!r.area_id)||null;}
function maps(parkings,data){return{p:new Map(parkings.map(x=>[x.id,x])),l:new Map(data.locations.map(x=>[x.id,x])),a:new Map(data.areas.map(x=>[x.id,x])),s:new Map(data.streets.map(x=>[x.id,x])),g:new Map(data.segments.map(x=>[x.id,x]))};}
function locate(row,map){const location=map.l.get(row.qr_location_id||row.id),parking=map.p.get(row.parking_id||location?.parking_id),area=map.a.get(location?.sector_id),street=map.s.get(location?.street_id),segment=map.g.get(location?.segment_id);return{parking,area,street,segment,side:SIDE_LABELS[segment?.street_side]||"—",label:[street?.name,segment?.name].filter(Boolean).join(" / ")||parking?.name||"Ubicación no disponible"};}
function matches(location,filters){return(!filters.parkingId||location.parking?.id===filters.parkingId)&&(!filters.areaId||location.area?.id===filters.areaId)&&(!filters.streetId||location.street?.id===filters.streetId)&&(!filters.segmentId||location.segment?.id===filters.segmentId);}
// Sesiones/Pagos On Street (§ corrección "filtro de fechas" 2026-08-28):
// reemplaza el filtro de un solo día por HOY/7 DÍAS/MES/AÑO/PERSONALIZADO,
// reutilizando resolvePeriodBounds -- misma política de timezone que ya
// usan Dashboard/Reportes, no una segunda lógica. Retrocompatible: si
// llega "date" solo (sin "period", p. ej. un enlace guardado antiguo), se
// interpreta como un rango de un solo día (mismos límites -04:00 00:00:00
// a 23:59:59.999 que antes calculaba el dayBounds() ya retirado). Sin
// period ni date, no hay límite (se listan todos los registros del
// alcance, igual que antes).
function periodBoundsFromFilters(filters){
  if(filters.period){
    const bounds=resolvePeriodBounds(filters.period,{from:filters.from,to:filters.to,month:filters.month,year:filters.year});
    return bounds?[bounds.from,bounds.to]:null;
  }
  if(filters.date){
    const bounds=resolvePeriodBounds("custom",{from:filters.date,to:filters.date});
    return bounds?[bounds.from,bounds.to]:null;
  }
  return null;
}

// Resuelve la misma clave de agrupación que placePerformanceRanking, para
// que capacidad y ocupación en vivo se sumen exactamente en el mismo grupo
// que las filas de rendimiento -- nunca una segunda definición de "cómo se
// agrupa" que pudiera desalinearse de la primera.
function groupKeyFor(location,groupBy){
  if(groupBy==="parking")return location.parking?.id;
  if(groupBy==="area")return location.area?.id;
  if(groupBy==="street")return location.street?.id;
  if(groupBy==="segment")return location.segment?.id;
  return location.segment?.id||location.street?.id||location.parking?.id;
}

// Ocupación (§6): capacidad real (segmentCapacity, desde parking_street_
// segments.capacity/right_capacity/left_capacity) + sesiones ACTIVE EN VIVO
// -- una foto del momento actual, no del período del filtro (igual criterio
// que "Sesiones activas ahora"). Cada ubicación QR corresponde a un único
// tramo (segment_id es UNIQUE en on_street_qr_locations), así que iterar
// las ubicaciones del mapa ya cubierto por locationData es suficiente para
// sumar capacidad por grupo sin una consulta aparte. Devuelve una función
// key->{active,capacity,rate}|null -- null explícito cuando el grupo no
// tiene ningún segmento con capacidad conocida (nunca inventa un
// denominador).
async function occupancyByGroup(db,parkingIds,map,groupBy){
  const capacityByKey=new Map();
  for(const location of map.l.values()){
    const resolved=locate({qr_location_id:location.id,parking_id:location.parking_id},map);
    const key=groupKeyFor(resolved,groupBy);
    if(!key)continue;
    const capacity=segmentCapacity(map.g.get(location.segment_id));
    if(capacity==null)continue;
    capacityByKey.set(key,(capacityByKey.get(key)||0)+capacity);
  }
  if(!capacityByKey.size)return ()=>null;
  const activeRows=parkingIds.length?fail(await db.from("on_street_pilot_sessions").select("qr_location_id").in("parking_id",parkingIds).eq("status","ACTIVE")):[];
  const activeByKey=new Map();
  for(const row of activeRows){
    const resolved=locate(row,map);
    const key=groupKeyFor(resolved,groupBy);
    if(!key)continue;
    activeByKey.set(key,(activeByKey.get(key)||0)+1);
  }
  return (key)=>occupancyRate(activeByKey.get(key)||0,capacityByKey.get(key)??null);
}
// companyId (§16/§19 de la reorganización 2026-08-28): mismo criterio que
// getOnStreetDashboardOverview/getOnStreetReport -- resolveParkingCompanyFilter
// (dentro de scopedParkings) ya garantiza que solo platform_admin puede
// sub-filtrar por empresa; para company_admin/operator el parámetro se
// ignora y su alcance sigue fijado por context.companyId. listOnStreetPayments
// reutiliza esta misma función (pasa "input" tal cual), así que ambas
// listas quedan cubiertas con este único cambio.
export async function listOnStreetSessions(db,context,input={}){
  const filters=normalizeOnStreetFilters(input),parkings=await scopedParkings(db,context,input.companyId||null),ids=parkings.map(x=>x.id),data=await locationData(db,ids),options={parkings,areas:data.areas,streets:data.streets,segments:data.segments};if(!ids.length)return{rows:[],filters,options};
  // Sin filtrar por payment_transaction_id: muestra tanto las sesiones pagadas
  // (producto definitivo) como cualquier sesión antigua del piloto sin cobro
  // que aún exista, para no perder trazabilidad histórica en la
  // administración. La UI decide cómo representar cada caso (ver
  // visibleOnStreetStatus y la ausencia de expires_at).
  let query=db.from("on_street_pilot_sessions").select("id,operational_number,qr_location_id,parking_id,phone_normalized,license_plate_normalized,status,started_at,expires_at,ended_at,purchased_minutes,amount_paid,simulated_amount,payment_transaction_id,created_at").in("parking_id",ids).order("started_at",{ascending:false}).limit(1000);const bounds=periodBoundsFromFilters(filters);if(bounds)query=query.gte("started_at",bounds[0]).lte("started_at",bounds[1]);const sessions=fail(await query),transactionIds=sessions.map(x=>x.payment_transaction_id).filter(Boolean),transactions=transactionIds.length?fail(await db.from("payment_transactions").select("id,provider,payment_type,provider_payment_type_code,status,buy_order,authorization_code,amount,committed_at").in("id",transactionIds)):[],transactionMap=new Map(transactions.map(x=>[x.id,x])),map=maps(parkings,data);
  const sessionIds=sessions.map(x=>x.id),extensionRows=await selectInChunks(chunk=>db.from("on_street_pilot_extensions").select("session_id").in("session_id",chunk),sessionIds),extensionCounts=new Map();for(const row of extensionRows)extensionCounts.set(row.session_id,(extensionCounts.get(row.session_id)||0)+1);
  const rows=sessions.map(session=>{const location=locate(session,map),transaction=transactionMap.get(session.payment_transaction_id)||null;return{...session,status:visibleOnStreetStatus(session),phone:maskAdminPhone(session.phone_normalized),amount:transaction?.status==="COMMITTED"?Number(session.amount_paid??transaction.amount):0,paymentType:paymentTypeFromTransaction(transaction),transaction,extensionCount:extensionCounts.get(session.id)||0,location};}).filter(row=>matches(row.location,filters));return{rows,filters,options};
}
export async function getOnStreetDashboard(db,context,input={}){const result=await listOnStreetSessions(db,context,input),rows=result.rows,total=rows.reduce((sum,row)=>sum+Number(row.purchased_minutes||0),0);return{...result,kpis:{activeSessions:rows.filter(row=>row.status==="ACTIVE"&&row.transaction?.status==="COMMITTED").length,operations:rows.length,revenue:rows.reduce((sum,row)=>sum+row.amount,0),averageMinutes:rows.length?Math.round(total/rows.length):0}};}
export async function listOnStreetPayments(db,context,input={}){
  const sessionData=await listOnStreetSessions(db,context,input),parkingIds=sessionData.options.parkings.map(x=>x.id);if(!parkingIds.length)return{...sessionData,rows:[]};const intents=fail(await db.from("on_street_payment_intents").select("id,public_token,parking_id,qr_location_id,resulting_session_id,operation_type,status,created_at").in("parking_id",parkingIds)),intentIds=intents.map(x=>x.id);if(!intentIds.length)return{...sessionData,rows:[]};let query=db.from("payment_transactions").select("id,source_id,provider,status,amount,currency,buy_order,payment_type,provider_payment_type_code,authorization_code,created_at,committed_at").in("source_id",intentIds).order("created_at",{ascending:false}).limit(1000);const bounds=periodBoundsFromFilters(sessionData.filters);if(bounds)query=query.gte("created_at",bounds[0]).lte("created_at",bounds[1]);const transactions=fail(await query),intentMap=new Map(intents.map(x=>[x.id,x])),sessionMap=new Map(sessionData.rows.map(x=>[x.id,x])),data=await locationData(db,parkingIds),map=maps(sessionData.options.parkings,data);const rows=transactions.map(transaction=>{const intent=intentMap.get(transaction.source_id),session=sessionMap.get(intent?.resulting_session_id),location=locate({qr_location_id:intent?.qr_location_id,parking_id:intent?.parking_id},map);return{...transaction,operationNumber:session?.operational_number||String(intent?.public_token||"").slice(0,8),sessionNumber:session?.operational_number||"Pendiente",paymentType:paymentTypeFromTransaction(transaction),location};}).filter(row=>matches(row.location,sessionData.filters));return{...sessionData,rows};
}

// ============================================================
// Paginación REAL server-side (§ corrección "eliminar límite de 1000"
// 2026-08-28): a diferencia de listOnStreetSessions/listOnStreetPayments
// de arriba (que siguen existiendo tal cual, sin tocar, porque
// getOnStreetSessionDetail y el reporte legado los siguen usando con su
// propio criterio), estas dos funciones son la fuente real de
// /api/on-street-qr/sessions y /payments: piden a Postgres exactamente
// COUNT + .range(offset, offset+pageSize-1) ya filtrado por
// empresa/estacionamiento/área/calle/tramo/período/patente/estado -- nunca
// traen el universo completo a Node. El join/resolución de nombres
// (ubicación, empresa, transacción) se hace SOLO sobre las filas de la
// página ya devuelta (pageSize filas, nunca miles), así que el costo no
// crece con el tamaño total del dataset.
function clampPage(input){
  const pageSize=[25,50,100,200].includes(Number(input.pageSize))?Number(input.pageSize):50;
  const page=Number.isInteger(Number(input.page))&&Number(input.page)>0?Number(input.page):1;
  return {page,pageSize};
}
function paginationShape(page,pageSize,totalRows){
  return {page,pageSize,totalRows,totalPages:Math.max(1,Math.ceil(totalRows/pageSize))};
}
// Resuelve, en una consulta acotada y liviana, los qr_location_id que
// pertenecen al Área/Calle/Tramo elegido -- ese conjunto está limitado por
// la infraestructura física real (decenas/cientos de ubicaciones QR por
// operación, nunca por el volumen de sesiones/pagos), así que es seguro
// pasarlo a un .in() aunque el universo de sesiones/pagos sea de miles.
// null = "sin filtro de jerarquía"; [] = "el filtro no calza con nada real".
async function qrLocationIdsForHierarchyFilter(db,parkingIds,filters){
  if(!filters.areaId&&!filters.streetId&&!filters.segmentId)return null;
  let q=db.from("on_street_qr_locations").select("id").in("parking_id",parkingIds);
  if(filters.segmentId)q=q.eq("segment_id",filters.segmentId);
  else if(filters.streetId)q=q.eq("street_id",filters.streetId);
  else if(filters.areaId)q=q.eq("sector_id",filters.areaId);
  const result=await q;if(result.error)throw result.error;
  return (result.data||[]).map(x=>x.id);
}
const SESSION_SORT_COLUMNS={started_at:"started_at",expires_at:"expires_at",purchased_minutes:"purchased_minutes",license_plate_normalized:"license_plate_normalized",status:"status",operational_number:"operational_number"};
// Estado mostrado (visibleOnStreetStatus) reclasifica ACTIVE+vencido como
// EXPIRED sin persistirlo -- filtrar por "EXPIRED" en la base debe incluir
// AMBOS casos reales (status='EXPIRED' persistido, y status='ACTIVE' cuyo
// expires_at ya pasó), o el filtro "Vencido" mostraría menos de lo real.
function applySessionStatusFilter(query,status){
  if(!status)return query;
  const nowIso=new Date().toISOString();
  if(status==="EXPIRED")return query.or(`status.eq.EXPIRED,and(status.eq.ACTIVE,expires_at.lte.${nowIso})`);
  if(status==="ACTIVE")return query.eq("status","ACTIVE").or(`expires_at.is.null,expires_at.gt.${nowIso}`);
  return query.eq("status",status);
}
export async function listOnStreetSessionsPage(db,context,input={}){
  const filters=normalizeOnStreetFilters(input),{page,pageSize}=clampPage(input);
  const parkings=await scopedParkings(db,context,input.companyId||null),parkingIds=parkings.map(x=>x.id);
  const optionsData=await locationData(db,parkingIds),options={parkings,areas:optionsData.areas,streets:optionsData.streets,segments:optionsData.segments};
  if(!parkingIds.length)return{rows:[],pagination:paginationShape(page,pageSize,0),filters,options};

  const qrLocationIds=await qrLocationIdsForHierarchyFilter(db,parkingIds,filters);
  if(qrLocationIds&&!qrLocationIds.length)return{rows:[],pagination:paginationShape(page,pageSize,0),filters,options};

  const scopedIds=filters.parkingId&&parkingIds.includes(filters.parkingId)?[filters.parkingId]:parkingIds;
  let query=db.from("on_street_pilot_sessions").select("id,operational_number,qr_location_id,parking_id,phone_normalized,license_plate_normalized,status,started_at,expires_at,ended_at,purchased_minutes,amount_paid,simulated_amount,payment_transaction_id,created_at",{count:"exact"}).in("parking_id",scopedIds);
  const bounds=periodBoundsFromFilters(filters);if(bounds)query=query.gte("started_at",bounds[0]).lte("started_at",bounds[1]);
  if(qrLocationIds)query=query.in("qr_location_id",qrLocationIds);
  if(filters.plate)query=query.ilike("license_plate_normalized",`%${filters.plate}%`);
  query=applySessionStatusFilter(query,filters.status);
  const sortColumn=SESSION_SORT_COLUMNS[input.sortKey]||"started_at";
  query=query.order(sortColumn,{ascending:input.sortDirection==="asc"});
  const offset=(page-1)*pageSize;
  query=query.range(offset,offset+pageSize-1);

  const{data:sessions,error,count}=await query;if(error)throw error;
  const map=maps(parkings,optionsData);
  const transactionIds=(sessions||[]).map(x=>x.payment_transaction_id).filter(Boolean);
  const transactions=transactionIds.length?fail(await db.from("payment_transactions").select("id,provider,payment_type,provider_payment_type_code,status,buy_order,authorization_code,amount,committed_at").in("id",transactionIds)):[];
  const transactionMap=new Map(transactions.map(x=>[x.id,x]));
  const sessionIds=(sessions||[]).map(x=>x.id);
  const extensionRows=sessionIds.length?fail(await db.from("on_street_pilot_extensions").select("session_id").in("session_id",sessionIds)):[];
  const extensionCounts=new Map();for(const row of extensionRows)extensionCounts.set(row.session_id,(extensionCounts.get(row.session_id)||0)+1);
  const rows=(sessions||[]).map(session=>{const location=locate(session,map),transaction=transactionMap.get(session.payment_transaction_id)||null;return{...session,status:visibleOnStreetStatus(session),phone:maskAdminPhone(session.phone_normalized),amount:transaction?.status==="COMMITTED"?Number(session.amount_paid??transaction.amount):0,paymentType:paymentTypeFromTransaction(transaction),transaction,extensionCount:extensionCounts.get(session.id)||0,location};});
  return{rows,pagination:paginationShape(page,pageSize,count||0),filters,options};
}

// Pagos (§ misma corrección): payment_transactions no tiene parking_id
// directo -- llega vía source_id -> on_street_payment_intents.parking_id,
// una FK real (ver migración 20260815100000). Se resuelve con el join
// embebido de PostgREST (select con !inner + filtro por columna del
// embed), NUNCA trayendo todos los intents/transacciones a Node para
// cruzarlos en JS -- eso es exactamente lo que esta corrección elimina.
//
// Fecha financiera (§4 de la corrección): para transacciones COMMITTED, el
// evento financiero real es committed_at (puede caer en un día/mes
// distinto a created_at, ver ejemplo del brief) -- el período filtra por
// committed_at cuando el estado es COMMITTED, y por created_at para el
// resto (CREATED/REDIRECTED/COMMITTING/ABORTED/REJECTED/FAILED, que no
// tienen fecha financiera propia pero sí interesa poder verlos por cuándo
// se intentaron, con fines de soporte/operación).
const PAYMENT_SORT_COLUMNS={created_at:"created_at",committed_at:"committed_at",amount:"amount",status:"status",buy_order:"buy_order"};
export async function listOnStreetPaymentsPage(db,context,input={}){
  const filters=normalizeOnStreetFilters(input),{page,pageSize}=clampPage(input);
  const parkings=await scopedParkings(db,context,input.companyId||null),parkingIds=parkings.map(x=>x.id);
  const optionsData=await locationData(db,parkingIds),options={parkings,areas:optionsData.areas,streets:optionsData.streets,segments:optionsData.segments};
  if(!parkingIds.length)return{rows:[],pagination:paginationShape(page,pageSize,0),filters,options};

  const qrLocationIds=await qrLocationIdsForHierarchyFilter(db,parkingIds,filters);
  if(qrLocationIds&&!qrLocationIds.length)return{rows:[],pagination:paginationShape(page,pageSize,0),filters,options};

  // Patente (§ pagos, filtro combinado): se resuelve primero a un conjunto
  // acotado de session_id (una búsqueda de patente siempre calza con pocas
  // sesiones, nunca con miles) y luego se filtra por
  // intent.resulting_session_id -- mismo criterio que el filtro de
  // jerarquía: nunca se trae el universo completo a Node para cruzar en JS.
  let sessionIdsForPlate=null;
  const scopedIds0=filters.parkingId&&parkingIds.includes(filters.parkingId)?[filters.parkingId]:parkingIds;
  if(filters.plate){
    const r=await db.from("on_street_pilot_sessions").select("id").in("parking_id",scopedIds0).ilike("license_plate_normalized",`%${filters.plate}%`);
    if(r.error)throw r.error;
    sessionIdsForPlate=(r.data||[]).map(x=>x.id);
    if(!sessionIdsForPlate.length)return{rows:[],pagination:paginationShape(page,pageSize,0),filters,options};
  }

  let query=db.from("payment_transactions")
    .select("id,source_id,provider,status,amount,currency,buy_order,payment_type,provider_payment_type_code,authorization_code,created_at,committed_at,on_street_payment_intents!inner(id,public_token,parking_id,qr_location_id,resulting_session_id,operation_type)",{count:"exact"})
    .in("on_street_payment_intents.parking_id",scopedIds0);
  if(qrLocationIds)query=query.in("on_street_payment_intents.qr_location_id",qrLocationIds);
  if(sessionIdsForPlate)query=query.in("on_street_payment_intents.resulting_session_id",sessionIdsForPlate);
  if(filters.status)query=query.eq("status",filters.status);
  const bounds=periodBoundsFromFilters(filters);
  if(bounds)query=query.or(`and(status.eq.COMMITTED,committed_at.gte.${bounds[0]},committed_at.lte.${bounds[1]}),and(status.neq.COMMITTED,created_at.gte.${bounds[0]},created_at.lte.${bounds[1]})`);
  const sortColumn=PAYMENT_SORT_COLUMNS[input.sortKey]||"created_at";
  query=query.order(sortColumn,{ascending:input.sortDirection==="asc"});
  const offset=(page-1)*pageSize;
  query=query.range(offset,offset+pageSize-1);

  const{data:transactions,error,count}=await query;if(error)throw error;
  const map=maps(parkings,optionsData);
  const resultingSessionIds=[...new Set((transactions||[]).map(t=>t.on_street_payment_intents?.resulting_session_id).filter(Boolean))];
  const sessionsById=resultingSessionIds.length?fail(await db.from("on_street_pilot_sessions").select("id,operational_number").in("id",resultingSessionIds)):[];
  const sessionMap=new Map(sessionsById.map(s=>[s.id,s]));
  const rows=(transactions||[]).map(transaction=>{
    const intent=transaction.on_street_payment_intents;
    const session=sessionMap.get(intent?.resulting_session_id);
    const location=locate({qr_location_id:intent?.qr_location_id,parking_id:intent?.parking_id},map);
    return{...transaction,operationNumber:session?.operational_number||String(intent?.public_token||"").slice(0,8),sessionNumber:session?.operational_number||"Pendiente",paymentType:paymentTypeFromTransaction(transaction),location};
  });
  return{rows,pagination:paginationShape(page,pageSize,count||0),filters,options};
}
// ============================================================

// HALLAZGO (auditoría 2026-08-28, §12/§13 del brief de reorganización): la
// columna "Empresa" del listado dependía únicamente de parkings.company_name
// (denormalizado), que puede quedar NULL/desincronizado aunque parkings.
// company_id -> companies sea una relación real e inequívoca (confirmado con
// datos reales: "On Street Test E2E" tiene company_name=NULL pero
// company_id="test-company-inspector-e2e", cuya fila en companies sí tiene
// trade_name="Operador Test"). listOnStreetLocationOptions/
// getOnStreetLocationDetail ya resolvían este mismo fallback
// (company?.trade_name||parking.company_name) -- listOnStreetLocations era
// el único lugar que no lo aplicaba. No se duplica dato nuevo en BD: se
// deriva en el momento, igual que en los otros dos lugares.
export async function listOnStreetLocations(db,context){
  const parkings=await scopedParkings(db,context),parkingIds=parkings.map(x=>x.id),data=await locationData(db,parkingIds),map=maps(parkings,data),rates=await activeRatesByParking(db,parkingIds);
  const companies=await companiesByIds(db,[...new Set(parkings.map(p=>p.company_id))]),companyMap=new Map(companies.map(c=>[c.id,c]));
  const resolvedParkings=parkings.map(p=>({...p,company_name:companyMap.get(p.company_id)?.trade_name||p.company_name}));
  const resolvedMap={...map,p:new Map(resolvedParkings.map(p=>[p.id,p]))};
  return{rows:data.locations.map(row=>{const location=locate(row,resolvedMap),rate=resolveRate(rates,row.parking_id,row.sector_id);return{...row,location,rate:rate?{minuteAmount:Number(rate.minute_amount),currency:rate.currency}:null};}),options:{parkings:resolvedParkings,areas:data.areas,streets:data.streets,segments:data.segments}};
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
    segments:segments.map(s=>({id:s.id,parkingId:s.parking_id,areaId:s.area_id,streetId:s.street_id,code:s.code,name:s.name,sortOrder:s.sort_order,side:SIDE_LABELS[s.street_side]||"—",hasQr:usedSegmentIds.has(s.id)})),
    // Decisión funcional "Proyectos On Street" (2026-08-29): cada Ubicación
    // QR exige una tarifa CONCRETA elegida explícitamente -- nunca resuelta
    // sola. Se listan TODAS las tarifas ACTIVE vigentes del estacionamiento
    // (no solo "la" resuelta por área) para que el formulario de creación
    // ofrezca un selector real con las alternativas disponibles del Proyecto.
    rates:rates.map(r=>({id:r.id,parkingId:r.parking_id,areaId:r.area_id,name:r.name,minuteAmount:Number(r.minute_amount),currency:r.currency})),
  };
}

// Crea una ubicación QR. Revalida en servidor que el estacionamiento
// pertenezca a la empresa del solicitante (o que sea Root) antes de insertar;
// el trigger validate_on_street_qr_location ya existente en la base de datos
// valida además la consistencia de la jerarquía área/calle/tramo/estacionamiento.
//
// Guarda rate_id (columna aditiva, ver migración 20260829100500): la tarifa
// llega elegida explícitamente por quien crea el QR (decisión funcional
// "Proyectos On Street" 2026-08-29, ver onStreetQrLocationFormCore.mjs) --
// nunca se resuelve sola. Se revalida en servidor que esa tarifa exista y
// pertenezca al MISMO estacionamiento, nunca confiando en el id recibido.
// Ubicaciones QR históricas (creadas antes de esta funcionalidad) quedan con
// rate_id=null y su cobro sigue resolviéndose dinámicamente como siempre
// (ver onStreetPilotRepository.js) -- no se reasignan ni se tocan.
export async function createOnStreetQrLocation(db,context,{parkingId,sectorId,streetId,segmentId,rateId,label,status}){
  const parking=await db.from("parkings").select("id,company_id").eq("id",parkingId).eq("type","ON_STREET").maybeSingle().then(r=>{if(r.error)throw r.error;return r.data;});
  assertOwnedParking(parking,context);
  const rate=await db.from("parking_rates").select("id,parking_id,status").eq("id",rateId).maybeSingle().then(r=>{if(r.error)throw r.error;return r.data;});
  if(!rate||rate.parking_id!==parkingId){const e=new Error("RATE_NOT_FOUND_FOR_PARKING");e.code="RATE_NOT_FOUND_FOR_PARKING";e.status=400;throw e;}
  const inserted=await db.from("on_street_qr_locations").insert({parking_id:parkingId,sector_id:sectorId,street_id:streetId,segment_id:segmentId,rate_id:rateId,label:String(label||"").trim(),status}).select("id,public_code,status,label,parking_id,sector_id,street_id,segment_id,rate_id,created_at").single();
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

export async function getOnStreetSessionDetail(db,context,id){const listed=await listOnStreetSessions(db,context,{}),session=listed.rows.find(row=>row.id===id);if(!session)return null;const extensions=fail(await db.from("on_street_pilot_extensions").select("id,additional_minutes,simulated_amount,previous_expires_at,new_expires_at,payment_transaction_id,created_at").eq("session_id",id).order("created_at")),paymentIds=[session.payment_transaction_id,...extensions.map(x=>x.payment_transaction_id)].filter(Boolean),transactions=paymentIds.length?fail(await db.from("payment_transactions").select("id,source_id,provider,status,amount,currency,buy_order,payment_type,provider_payment_type_code,authorization_code,created_at,redirected_at,committed_at,failed_at").in("id",paymentIds)):[];
  // Fiscalizaciones de esta sesión (§15/§20 del brief): completa la línea de
  // tiempo con eventos reales de Inspectores (Etapa 2), sin duplicar
  // on_street_inspections -- solo se lee, filtrado por session_id.
  const inspections=fail(await db.from("on_street_inspections").select("id,license_plate_normalized,inspector_user_id,inspection_type,vehicle_still_present,observations,inspected_at,sms_status,sms_sent_at").eq("session_id",id).order("inspected_at"));
  // SMS previo al vencimiento (§11): historial real por sesión (puede haber
  // más de un recordatorio si la sesión se extendió varias veces).
  const smsReminders=fail(await db.from("on_street_pilot_notifications").select("id,type,status,scheduled_at,sent_at,attempts,error_code").eq("session_id",id).order("scheduled_at"));
  return{session,extensions,transactions,inspections,smsReminders};}

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

  const sessionsRaw=fail(await db.from("on_street_pilot_sessions").select("id,operational_number,qr_location_id,parking_id,phone_normalized,license_plate_normalized,status,started_at,expires_at,ended_at,purchased_minutes,amount_paid,payment_transaction_id").in("parking_id",parkingIds).gte("started_at",bounds.from).lte("started_at",bounds.to).order("started_at",{ascending:false}).limit(REPORT_ROW_CAP));
  const sessions=sessionsRaw.map(row=>({...row,location:locate(row,map)})).filter(row=>matches(row.location,filters));
  const sessionIds=sessions.map(s=>s.id);
  const sessionMap=new Map(sessions.map(s=>[s.id,s]));

  const extensions=await selectInChunks(chunk=>db.from("on_street_pilot_extensions").select("id,session_id,additional_minutes,simulated_amount,payment_transaction_id,created_at").in("session_id",chunk),sessionIds);

  const intents=fail(await db.from("on_street_payment_intents").select("id,parking_id,qr_location_id,operation_type,resulting_session_id,target_session_id").in("parking_id",parkingIds).gte("created_at",bounds.from).lte("created_at",bounds.to));
  const intentMap=new Map(intents.map(i=>[i.id,i]));
  const intentIds=intents.map(i=>i.id);
  // Mismo defecto que sessionIds arriba: "intents" no tiene .limit() propio
  // (a diferencia de "sessions", que sí tiene REPORT_ROW_CAP), así que
  // intentIds puede ser incluso más grande en un período con mucho
  // volumen -- se trocea igual, por la misma causa raíz.
  const paymentAttempts=await selectInChunks(chunk=>db.from("payment_transactions").select("id,source_id,status,amount,currency,buy_order,authorization_code,payment_type,created_at,committed_at").in("source_id",chunk),intentIds);

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
      alerts:[],activeSessions:[],
      revenueBreakdown:revenueBreakdown([],new Map()),paymentMethodBreakdown:paymentMethodBreakdown([]),soonToExpire:0,
      inspectionKpis:emptyInspectionKpis(),
      revenueTimeSeries:{granularity:"day",points:[]},revenueByHourOfDay:revenueByHourOfDay([]),sessionsByHourOfDay:sessionsByHourOfDay([]),
      durationDistribution:durationDistribution([]),sessionStateBreakdown:{VIGENTE:0,POR_VENCER:0,VENCIDA:0,FINALIZADA:0,FISCALIZADA:0},
      placePerformance:[],smsReminderKpis:{total:0,sent:0,pending:0,failed:0,cancelled:0},
      options:{...scoped.filterOptions,areas:[],streets:[],segments:[]},
    };
  }
  const{bounds,sessions,extensions,paymentAttempts,activeSessionsNow,intentMap,parkingIds,map}=scoped;
  const kpis=computeKpis({sessions,extensions,paymentAttempts,activeSessionsNow});
  const activePreview=sessions.filter(s=>visibleOnStreetStatus(s)==="ACTIVE").slice(0,20).map(s=>({...s,phone:maskAdminPhone(s.phone_normalized)}));
  // Fiscalizaciones (§9/§20): mismo alcance/período que el resto del
  // Dashboard, contadas directo desde on_street_inspections (Etapa 2 de
  // Inspectores) -- no se lee de sessions/extensions, es una tabla propia.
  // Se agrega session_id (antes no se seleccionaba) para poder marcar
  // "FISCALIZADA" en sessionStateBreakdown y en Rendimiento por lugar sin
  // una segunda consulta.
  const inspectionRows=fail(await db.from("on_street_inspections").select("session_id,license_plate_normalized,inspection_type,sms_status").in("parking_id",parkingIds).gte("inspected_at",bounds.from).lte("inspected_at",bounds.to).limit(2000));
  const inspectionKpis=computeInspectionKpis(inspectionRows);
  const fiscalizedSessionIds=new Set(inspectionRows.map(r=>r.session_id).filter(Boolean));

  const groupBy=["parking","area","street","segment","qrLocation"].includes(input.groupBy)?input.groupBy:"qrLocation";
  const occupancyFn=await occupancyByGroup(db,parkingIds,map,groupBy);
  const placePerformance=sortPlacePerformance(placePerformanceRanking(sessions,extensions,fiscalizedSessionIds,(s)=>s.location,groupBy,new Date(),occupancyFn),input.placeSortBy||input.sortBy||"revenue");

  // SMS previo al vencimiento (§11 de la auditoría 2026-08-28):
  // on_street_pilot_notifications ya persiste type='EXPIRING_SOON' con
  // status real (PENDING/SENT/FAILED/CANCELLED) -- se reporta aquí en vez
  // del texto fijo "Disponible al activar recordatorios SMS", sin tocar el
  // sistema de envío (onStreetSmsCore.mjs no se modifica).
  const reminderRows=fail(await db.from("on_street_pilot_notifications").select("status").eq("type","EXPIRING_SOON").in("parking_id",parkingIds).gte("scheduled_at",bounds.from).lte("scheduled_at",bounds.to).limit(5000));
  const smsReminderKpis={total:reminderRows.length,sent:reminderRows.filter(r=>r.status==="SENT").length,pending:reminderRows.filter(r=>r.status==="PENDING").length,failed:reminderRows.filter(r=>r.status==="FAILED").length,cancelled:reminderRows.filter(r=>r.status==="CANCELLED").length};

  return{
    period:input.period||"today",bounds,
    kpis,
    sessionsByDay:sessionsByDay(sessions,bounds.from,bounds.to),
    revenueByDay:revenueByDay(sessions,bounds.from,bounds.to),
    minutesDistribution:minutesDistribution(sessions),
    extensions:extensionsBreakdown(sessions,extensions),
    statusDistribution:statusDistribution(sessions),
    alerts:operationalAlerts({paymentAttempts,sessions}),
    activeSessions:activePreview,
    // Ingresos por tipo de pago y medio de pago (§11/§16/§19/§20 de la
    // administración On Street): ver revenueBreakdown/paymentMethodBreakdown
    // en onStreetDashboardCore.mjs para la nota de consistencia con "kpis.revenue".
    revenueBreakdown:revenueBreakdown(paymentAttempts,intentMap),
    paymentMethodBreakdown:paymentMethodBreakdown(paymentAttempts),
    soonToExpire:soonToExpireCount(sessions),
    inspectionKpis,
    smsReminderKpis,
    // Gráficos pendientes cerrados en esta tarea (§4 de la auditoría
    // 2026-08-28): evolución de ingresos con granularidad dinámica,
    // recaudación por hora del día, duración por rangos y sesiones por
    // estado (con Fiscalizada como categoría transversal, ver
    // sessionStateBreakdown).
    revenueTimeSeries:revenueTimeSeries(paymentAttempts,intentMap,bounds),
    revenueByHourOfDay:revenueByHourOfDay(paymentAttempts),
    // "Horarios de mayor uso" (Reportes On Street -> Resumen/Gráficos,
    // 2026-08-30): por inicio de sesión, no por pago -- ver
    // sessionsByHourOfDay en onStreetDashboardCore.mjs.
    sessionsByHourOfDay:sessionsByHourOfDay(sessions),
    durationDistribution:durationDistribution(sessions),
    sessionStateBreakdown:sessionStateBreakdown(sessions,fiscalizedSessionIds),
    // Rendimiento por lugar (§5): agrupable por groupBy, con ocupación real
    // cuando hay capacidad conocida (§6) -- ver occupancyByGroup.
    placePerformance,
    groupBy,
    options:{...scoped.filterOptions,areas:scoped.areas,streets:scoped.streets,segments:scoped.segments},
  };
}

// Reportes On Street: consulta histórica con detalle exportable (a
// diferencia del Dashboard, que resume). Mismo aislamiento por empresa
// (fetchOnStreetScopedData), mismo período/filtros. "type" determina qué
// tabla de detalle se arma — todas a partir de los mismos datos ya
// aislados, sin una segunda consulta insegura.
function emptyReportSummary(){return{kpis:computeKpis({sessions:[],extensions:[],paymentAttempts:[],activeSessionsNow:0}),revenue:revenueBreakdown([],new Map()),paymentMethods:paymentMethodBreakdown([]),extensions:extensionsBreakdown([],[]),places:[],inspections:emptyInspectionKpis()};}

export async function getOnStreetReport(db,context,input={}){
  const scoped=await fetchOnStreetScopedData(db,context,input);
  const base={bounds:scoped.bounds,options:{...scoped.filterOptions,areas:scoped.areas,streets:scoped.streets,segments:scoped.segments}};
  if(!scoped.parkingIds.length||!scoped.bounds)return{...base,type:input.type||"sesiones",rows:[],summary:emptyReportSummary(),pagination:{page:1,pageSize:25,totalRows:0,totalPages:1}};

  const{sessions,extensions,paymentAttempts,intents,intentMap,sessionMap,map,parkingIds,bounds,activeSessionsNow,filters}=scoped;
  const type=input.type||"sesiones";

  // Fiscalizaciones dentro del mismo alcance (empresa/lugar/período) que el
  // resto del reporte -- mismo criterio que getOnStreetDashboardOverview
  // (parking_id + inspected_at dentro del rango), una sola consulta
  // reutilizada tanto para el resumen exportable (Hoja 2, §31-32) como para
  // las columnas Fiscalizado/Inspector de "sesiones" (§25) — nunca se
  // duplica la lectura de on_street_inspections.
  const inspectionRows=fail(await db.from("on_street_inspections").select("session_id,inspector_user_id,inspected_at,license_plate_normalized,inspection_type,sms_status").in("parking_id",parkingIds).gte("inspected_at",bounds.from).lte("inspected_at",bounds.to).limit(2000));
  const inspectorIds=[...new Set(inspectionRows.map(r=>r.inspector_user_id).filter(Boolean))];
  const inspectorEmails=inspectorIds.length?await db.auth.admin.listUsers({perPage:200}).then(r=>new Map((r.data?.users||[]).map(u=>[u.id,u.email]))):new Map();
  const inspectionBySession=new Map(inspectionRows.filter(r=>r.session_id).map(r=>[r.session_id,r]));
  const fiscalizedSessionIds=new Set(inspectionRows.map(r=>r.session_id).filter(Boolean));

  // Resumen (Hoja 2 del Excel, §31-32): mismos cálculos ya probados del
  // Dashboard (computeKpis/revenueBreakdown/paymentMethodBreakdown/
  // extensionsBreakdown/computeInspectionKpis), aplicados al mismo alcance
  // que produce las filas de detalle -- respeta exactamente los filtros
  // activos, sin volver a consultar la base.
  const summary={
    kpis:computeKpis({sessions,extensions,paymentAttempts,activeSessionsNow}),
    revenue:revenueBreakdown(paymentAttempts,intentMap),
    paymentMethods:paymentMethodBreakdown(paymentAttempts),
    extensions:extensionsBreakdown(sessions,extensions),
    places:sortLocationRanking(locationRanking(sessions,extensions,(s)=>s.location),"revenue").slice(0,10),
    inspections:computeInspectionKpis(inspectionRows),
  };

  if(type==="sesiones"){
    // SMS previo al vencimiento (§11 de la auditoría): on_street_pilot_
    // notifications ya persiste type='EXPIRING_SOON' con status/sent_at
    // reales (no simulados) -- se agrega al detalle, sin tocar el sistema
    // de envío. Se toma la notificación EXPIRING_SOON más reciente por
    // sesión (una sesión puede reprogramar el aviso tras una extensión).
    const sessionIds=sessions.map(s=>s.id);
    // Mismo defecto que las extensiones (ver selectInChunks arriba):
    // sessionIds puede acercarse a REPORT_ROW_CAP=1000, así que el .in()
    // se trocea en lotes. El ".order(scheduled_at desc)" original solo
    // servía para que "el primero por sesión" fuera el más reciente -- al
    // trocear, cada lote llega ordenado por separado, así que ya no hay un
    // orden global. Se reemplaza por una comparación explícita (se queda
    // el recordatorio más reciente por sesión, sin importar en qué lote ni
    // en qué orden llegó) -- mismo resultado final, ahora sin depender del
    // orden de llegada.
    const reminderRows=await selectInChunks(chunk=>db.from("on_street_pilot_notifications").select("session_id,status,sent_at,scheduled_at").eq("type","EXPIRING_SOON").in("session_id",chunk),sessionIds);
    const reminderBySession=new Map();
    for(const row of reminderRows){
      const current=reminderBySession.get(row.session_id);
      if(!current||new Date(row.scheduled_at)>new Date(current.scheduled_at))reminderBySession.set(row.session_id,row);
    }
    // Fiscalizado Sí/No + Inspector (§25 del brief): una sesión puede tener
    // como máximo una fiscalización OVERSTAY real (índice único parcial en
    // on_street_inspections, ver migración de Inspectores Etapa 2) -- basta
    // un mapa por session_id, sin duplicar filas.
    let rows=sessions.map(s=>{const inspection=inspectionBySession.get(s.id);const reminder=reminderBySession.get(s.id);return{...s,phone:maskAdminPhone(s.phone_normalized),status:visibleOnStreetStatus(s),ubicacion:s.location?.label||"—",extensionCount:extensions.filter(e=>e.session_id===s.id).length,fiscalized:Boolean(inspection),inspector:inspection?inspectorEmails.get(inspection.inspector_user_id)||"—":"—",fiscalizedAt:inspection?.inspected_at||null,smsReminderSent:reminder?reminder.status==="SENT":false,smsReminderAt:reminder?.sent_at||null,smsReminderStatus:reminder?.status||"—"};});
    // Búsqueda por patente (§ página integral "Reportes On Street",
    // 2026-08-30, requisito "buscar" de las tablas) y filtro de clic por
    // estado (p. ej. clic en el KPI "Sesiones activas" -> status=ACTIVE):
    // se aplican sobre "rows" ya en memoria (sessions viene acotado por
    // REPORT_ROW_CAP=1000, nunca miles) -- sin una segunda consulta a la
    // base de datos.
    if(input.plate){const needle=String(input.plate).toUpperCase();rows=rows.filter(r=>String(r.license_plate_normalized||"").toUpperCase().includes(needle));}
    if(input.status&&["ACTIVE","CLOSED","EXPIRED"].includes(input.status))rows=rows.filter(r=>r.status===input.status);
    return{...base,type,summary,...applySortAndPaginate(rows,input)};
  }
  if(type==="pagos"){
    // Corrección "Reportes On Street -> Pagos -> Gráficos" (2026-08-30):
    // hasta ahora paymentAttempts NUNCA se acotaba por Área/Calle/Tramo
    // (solo "sessions" lo hacía, vía matches() más abajo) -- un vacío
    // preexistente que dejaba el reporte de Pagos ignorando esos 3 filtros
    // superiores. Se corrige aquí, solo dentro de la rama "pagos" (no
    // afecta a sesiones/lugar/extensiones ni al resumen financiero
    // exportado a Excel, que sigue calculándose como siempre sobre
    // paymentAttempts sin acotar): ahora la ubicación de cada transacción
    // se resuelve una sola vez y se filtra con la misma matches() que ya
    // usan las sesiones -- así el Detalle y los Gráficos respetan
    // exactamente los mismos filtros superiores (Estacionamiento ya
    // acotaba correctamente antes, por venir de parkingIds).
    const located=paymentAttempts.map(t=>{
      const intent=intentMapFor(intents,t.source_id);
      const location=locate({qr_location_id:intent?.qr_location_id,parking_id:intent?.parking_id},map);
      return{transaction:t,intent,location};
    }).filter(({location})=>matches(location,filters));

    // Filtros de clic (exclusivos del Detalle -- ver §4 del requerimiento
    // "clic en un gráfico filtra el Detalle"): paymentType/operationType/
    // approval. Nunca afectan a "charts" más abajo (que se calcula siempre
    // sobre "located", acotado solo por los filtros superiores) -- así el
    // clic en un gráfico no "retroalimenta" a los propios gráficos, y los
    // totales de los gráficos cuadran exactamente con el Detalle para los
    // mismos filtros superiores (§5).
    let filteredRows=located;
    if(input.paymentType&&["DEBIT","CREDIT","UNKNOWN"].includes(input.paymentType)){
      filteredRows=filteredRows.filter(({transaction:t})=>(t.payment_type==="DEBIT"||t.payment_type==="CREDIT"?t.payment_type:"UNKNOWN")===input.paymentType);
    }
    if(input.operationType&&["INITIAL","EXTENSION"].includes(input.operationType)){
      filteredRows=filteredRows.filter(({intent})=>(intent?.operation_type==="EXTENSION"?"EXTENSION":"INITIAL")===input.operationType);
    }
    if(input.approval==="approved")filteredRows=filteredRows.filter(({transaction:t})=>t.status==="COMMITTED");
    else if(input.approval==="rejected")filteredRows=filteredRows.filter(({transaction:t})=>["REJECTED","ABORTED","FAILED"].includes(t.status));
    // Búsqueda por patente (mismo requisito que en "sesiones" arriba): la
    // patente vive en la sesión resultante/objetivo del intent, no en la
    // transacción -- se resuelve igual que "licensePlate" más abajo.
    if(input.plate){
      const needle=String(input.plate).toUpperCase();
      filteredRows=filteredRows.filter(({intent})=>{
        const session=intent?.resulting_session_id?sessionMap.get(intent.resulting_session_id):intent?.target_session_id?sessionMap.get(intent.target_session_id):null;
        return String(session?.license_plate_normalized||"").toUpperCase().includes(needle);
      });
    }

    const rows=filteredRows.map(({transaction:t,intent,location})=>{
      const session=intent?.resulting_session_id?sessionMap.get(intent.resulting_session_id):intent?.target_session_id?sessionMap.get(intent.target_session_id):null;
      return{...t,operationType:intent?.operation_type||"—",ubicacion:location.label,sessionNumber:session?.operational_number||"—",licensePlate:session?.license_plate_normalized||"—",paymentTypeLabel:paymentTypeFromTransaction(t)};
    });

    // Gráficos (nueva pestaña "Gráficos" de Reportes -> Pagos): agregados
    // SIEMPRE sobre "located" (solo filtros superiores), nunca sobre
    // "filteredRows" -- ver nota arriba.
    const charts={
      byDay:paymentsByDay(located,bounds),
      byParking:paymentRevenueByGroup(located,"parking"),
      byArea:paymentRevenueByGroup(located,"area"),
      byStreet:paymentRevenueByGroup(located,"street"),
      bySegment:paymentRevenueByGroup(located,"segment"),
    };
    return{...base,type,summary:{...summary,charts},...applySortAndPaginate(rows,input)};
  }
  if(type==="ubicaciones"||type==="lugar"){
    // "Rendimiento por lugar" (§5): ahora agrupable por cualquier nivel de
    // la jerarquía (antes solo por ubicación QR) -- reutiliza
    // placePerformanceRanking (misma función que el Dashboard, sin
    // duplicar), con ocupación real cuando hay capacidad conocida (§6).
    const groupBy=["parking","area","street","segment","qrLocation"].includes(input.groupBy)?input.groupBy:"qrLocation";
    const occupancyFn=await occupancyByGroup(db,parkingIds,map,groupBy);
    const rows=sortPlacePerformance(placePerformanceRanking(sessions,extensions,fiscalizedSessionIds,(s)=>s.location,groupBy,new Date(),occupancyFn),input.sortBy||input.placeSortBy||"revenue");
    return{...base,type:"lugar",groupBy,summary,...applySortAndPaginate(rows,{...input,sortKey:input.sortKey})};
  }
  if(type==="extensiones"){
    let rows=extensions.map(e=>{
      const session=sessionMap.get(e.session_id);
      const transaction=session?paymentAttempts.find(t=>t.id===e.payment_transaction_id):null;
      return{...e,operational_number:session?.operational_number||"—",ubicacion:session?.location?.label||"—",amount:transaction?.status==="COMMITTED"?Number(transaction.amount):0,licensePlate:session?.license_plate_normalized||"—"};
    });
    // Búsqueda por patente (mismo requisito que en "sesiones"/"pagos").
    if(input.plate){const needle=String(input.plate).toUpperCase();rows=rows.filter(r=>String(r.licensePlate||"").toUpperCase().includes(needle));}
    return{...base,type,summary,...applySortAndPaginate(rows,input)};
  }
  // "operadores" y "sms" no se implementan aquí: no existe hoy un campo de
  // atribución real de operador por sesión, y las estadísticas SMS no
  // deben simularse (ver onStreetPilotNotifications / instrucción del
  // brief) — el frontend debe mostrar el estado "Disponible al activar…"
  // en vez de pedir este "type".
  return{...base,type,summary,rows:[],pagination:{page:1,pageSize:25,totalRows:0,totalPages:1}};
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

// Listados administrativos de Área/Calle/Tramo On Street (§14/§15/§16 de la
// reorganización 2026-08-28): reutilizan scopedParkings (mismo aislamiento
// multiempresa que el resto del módulo, incluido el sub-filtro companyId
// para Root -- ver listOnStreetSessions) y devuelven exactamente los campos
// reales de parking_sectors/parking_streets/parking_street_segments
// (verificados contra el esquema real, sin inventar columnas). La ficha de
// edición NO se duplica aquí: cada fila trae el "code" del estacionamiento
// padre para enlazar directamente a la ficha real ya existente
// (/estacionamientos/[code]/sectores/[sectorId]/... , mismo PATCH/
// validación que usa Off Street -- ver OnStreetQuickCreate.js, que sigue el
// mismo criterio de "redirigir a la fuente de verdad, no duplicarla").
function resolveParkingsMap(parkings,companyMap){
  return new Map(parkings.map(p=>[p.id,{id:p.id,code:p.code,name:p.name,companyName:companyMap.get(p.company_id)?.trade_name||p.company_name}]));
}

export async function listOnStreetAreas(db,context,input={}){
  const parkings=await scopedParkings(db,context,input.companyId||null),parkingIds=parkings.map(p=>p.id);
  if(!parkingIds.length)return{rows:[],options:{parkings}};
  const companies=await companiesByIds(db,[...new Set(parkings.map(p=>p.company_id))]),companyMap=new Map(companies.map(c=>[c.id,c]));
  const parkingMap=resolveParkingsMap(parkings,companyMap);
  const areas=fail(await db.from("parking_sectors").select("id,parking_id,code,name,status,description,notes,capacity,occupied,created_at,updated_at").in("parking_id",parkingIds).order("name"));
  const areaIds=areas.map(a=>a.id);
  const streetCounts=new Map();
  if(areaIds.length){
    const streets=fail(await db.from("parking_streets").select("id,sector_id").in("sector_id",areaIds));
    for(const s of streets)streetCounts.set(s.sector_id,(streetCounts.get(s.sector_id)||0)+1);
  }
  const rows=areas.filter(a=>!input.parkingId||a.parking_id===input.parkingId).map(a=>({...a,parking:parkingMap.get(a.parking_id)||null,streetCount:streetCounts.get(a.id)||0}));
  return{rows,options:{parkings}};
}

export async function listOnStreetStreets(db,context,input={}){
  const parkings=await scopedParkings(db,context,input.companyId||null),parkingIds=parkings.map(p=>p.id);
  if(!parkingIds.length)return{rows:[],options:{parkings,areas:[]}};
  const companies=await companiesByIds(db,[...new Set(parkings.map(p=>p.company_id))]),companyMap=new Map(companies.map(c=>[c.id,c]));
  const parkingMap=resolveParkingsMap(parkings,companyMap);
  const areas=fail(await db.from("parking_sectors").select("id,parking_id,code,name").in("parking_id",parkingIds));
  const areaMap=new Map(areas.map(a=>[a.id,a]));
  const streets=fail(await db.from("parking_streets").select("id,parking_id,sector_id,name,status,district,notes,capacity,occupied,created_at,updated_at").in("parking_id",parkingIds).order("name"));
  const streetIds=streets.map(s=>s.id);
  const segmentCounts=new Map();
  if(streetIds.length){
    const segments=fail(await db.from("parking_street_segments").select("id,street_id").in("street_id",streetIds));
    for(const s of segments)segmentCounts.set(s.street_id,(segmentCounts.get(s.street_id)||0)+1);
  }
  const rows=streets.filter(s=>(!input.parkingId||s.parking_id===input.parkingId)&&(!input.areaId||s.sector_id===input.areaId)).map(s=>{
    const area=areaMap.get(s.sector_id);
    return{...s,parking:parkingMap.get(s.parking_id)||null,area:area?{id:area.id,code:area.code,name:area.name}:null,segmentCount:segmentCounts.get(s.id)||0};
  });
  return{rows,options:{parkings,areas}};
}

// Ficha nativa On Street de un Área/Calle (§2/§3 de la reorganización
// 2026-08-28): a diferencia de listOnStreetAreas/Streets (para el listado),
// estas devuelven exactamente lo que StructureEntityForm necesita como
// "entity" (mismos nombres de campo crudos de parking_sectors/
// parking_streets: code,name,status,description,notes,capacity,occupied)
// más el "parking" con el "code" real (StructureEntityForm arma su propio
// endpoint como /api/estacionamientos/${parking.code}/..., el mismo PATCH
// ya autorizado y probado que usa Off Street -- no se duplica ni se crea un
// segundo endpoint de escritura). El aislamiento por empresa es el mismo
// assertOwnedParking ya usado en getOnStreetLocationDetail.
export async function getOnStreetAreaDetail(db,context,id){
  const area=await db.from("parking_sectors").select("id,parking_id,code,name,status,description,notes,capacity,occupied,created_at,updated_at").eq("id",id).maybeSingle().then(r=>{if(r.error)throw r.error;return r.data;});
  if(!area)return null;
  const parking=await db.from("parkings").select("id,code,name,company_id,company_name").eq("id",area.parking_id).maybeSingle().then(r=>{if(r.error)throw r.error;return r.data;});
  assertOwnedParking(parking,context);
  const company=(await companiesByIds(db,[parking.company_id]))[0]||null;
  const streets=fail(await db.from("parking_streets").select("id,name,status").eq("sector_id",id).order("name"));
  const streetIds=streets.map(s=>s.id);
  const segmentCounts=new Map();
  if(streetIds.length){
    const segments=fail(await db.from("parking_street_segments").select("id,street_id").in("street_id",streetIds));
    for(const s of segments)segmentCounts.set(s.street_id,(segmentCounts.get(s.street_id)||0)+1);
  }
  return{
    area,
    parking:{id:parking.id,code:parking.code,name:parking.name,companyName:company?.trade_name||parking.company_name},
    streets:streets.map(s=>({...s,segmentCount:segmentCounts.get(s.id)||0})),
  };
}

export async function getOnStreetStreetDetail(db,context,id){
  const street=await db.from("parking_streets").select("id,parking_id,sector_id,name,status,district,notes,capacity,occupied,created_at,updated_at").eq("id",id).maybeSingle().then(r=>{if(r.error)throw r.error;return r.data;});
  if(!street)return null;
  const parking=await db.from("parkings").select("id,code,name,company_id,company_name").eq("id",street.parking_id).maybeSingle().then(r=>{if(r.error)throw r.error;return r.data;});
  assertOwnedParking(parking,context);
  const company=(await companiesByIds(db,[parking.company_id]))[0]||null;
  const area=await db.from("parking_sectors").select("id,code,name").eq("id",street.sector_id).maybeSingle().then(r=>{if(r.error)throw r.error;return r.data;});
  const segments=fail(await db.from("parking_street_segments").select("id,code,name,from_number,to_number,street_side,capacity,occupied_spaces,status").eq("street_id",id).order("sort_order"));
  return{
    street,
    parking:{id:parking.id,code:parking.code,name:parking.name,companyName:company?.trade_name||parking.company_name},
    area:area?{id:area.id,code:area.code,name:area.name}:null,
    segments:segments.map(s=>({...s,side:SIDE_LABELS[s.street_side]||"—"})),
  };
}

export async function listOnStreetSegments(db,context,input={}){
  const parkings=await scopedParkings(db,context,input.companyId||null),parkingIds=parkings.map(p=>p.id);
  if(!parkingIds.length)return{rows:[],options:{parkings,areas:[],streets:[]}};
  const companies=await companiesByIds(db,[...new Set(parkings.map(p=>p.company_id))]),companyMap=new Map(companies.map(c=>[c.id,c]));
  const parkingMap=resolveParkingsMap(parkings,companyMap);
  const areas=fail(await db.from("parking_sectors").select("id,parking_id,code,name").in("parking_id",parkingIds));
  const areaMap=new Map(areas.map(a=>[a.id,a]));
  const streets=fail(await db.from("parking_streets").select("id,parking_id,sector_id,name").in("parking_id",parkingIds));
  const streetMap=new Map(streets.map(s=>[s.id,s]));
  const segments=fail(await db.from("parking_street_segments").select("id,parking_id,area_id,street_id,code,name,from_number,to_number,street_side,capacity,occupied_spaces,status,created_at,updated_at").in("parking_id",parkingIds).order("name"));
  const rows=segments.filter(seg=>(!input.parkingId||seg.parking_id===input.parkingId)&&(!input.areaId||seg.area_id===input.areaId)&&(!input.streetId||seg.street_id===input.streetId)).map(seg=>{
    const area=areaMap.get(seg.area_id),street=streetMap.get(seg.street_id);
    return{...seg,side:SIDE_LABELS[seg.street_side]||"—",parking:parkingMap.get(seg.parking_id)||null,area:area?{id:area.id,code:area.code,name:area.name}:null,street:street?{id:street.id,name:street.name}:null};
  });
  return{rows,options:{parkings,areas,streets}};
}

// ============================================================
// "Proyecto On Street" (§ UX "Proyectos On Street" 2026-08-28).
//
// DEFINICIÓN (documentada también en el informe): un Proyecto On Street
// NO es una entidad nueva -- es el Estacionamiento (parkings.type=
// 'ON_STREET') tal cual ya existe, presentado con un nombre y una
// experiencia unificada. Ya es la raíz natural: Empresa (company_id),
// Área/Calle/Tramo (parking_id), Ubicaciones QR (parking_id), Sesiones/
// Pagos (parking_id), Tarifas (parking_id) cuelgan TODOS de un
// Estacionamiento. No se creó una tabla "projects": hubiera duplicado
// exactamente lo que parkings ya representa, sin agregar ningún dato real
// nuevo (ver auditoría en el informe).
//
// "Vigente"/"actual" (§4 del brief) = parkings.status='ACTIVE' -- estado
// real ya existente (ESTACIONAMIENTO_STATES en estacionamientos.mjs), NO
// "tuvo actividad hoy": un proyecto activo sin sesiones hoy igual aparece
// (ver el count() con head:true más abajo, nunca un filtro por presencia
// de sesiones).
// Corrección definitiva "Proyectos On Street siguen sin aparecer"
// (2026-08-30): "Proyectos actuales" = TODOS los Estacionamientos ON_STREET
// accesibles por el usuario, en CUALQUIER estado real (DRAFT/CONFIGURING/
// READY_FOR_REVIEW/ACTIVE/INACTIVE/SUSPENDED/CLOSED) -- por defecto sin
// filtrar. Antes exigía status='ACTIVE' siempre, así que un Proyecto recién
// creado (nace DRAFT, ver /api/estacionamientos POST) nunca aparecía en el
// listado principal -- rompía el flujo real (Estructura/Tarifas/QR/Revisión
// se completan DESDE la ficha de un Proyecto DRAFT). input.status es
// opcional: si viene, filtra a ESE estado exacto; si no viene, no filtra.
export async function listOnStreetProjects(db,context,input={}){
  const parkings=await scopedParkingsWithStatus(db,context,input.companyId||null,input.status||null),parkingIds=parkings.map(p=>p.id);
  if(!parkingIds.length)return{rows:[],options:{parkings:[]}};
  const companies=await companiesByIds(db,[...new Set(parkings.map(p=>p.company_id))]),companyMap=new Map(companies.map(c=>[c.id,c]));

  const areas=fail(await db.from("parking_sectors").select("id,parking_id").in("parking_id",parkingIds));
  const areaCountByParking=new Map();for(const a of areas)areaCountByParking.set(a.parking_id,(areaCountByParking.get(a.parking_id)||0)+1);
  const streets=fail(await db.from("parking_streets").select("id,parking_id").in("parking_id",parkingIds));
  const streetCountByParking=new Map();for(const s of streets)streetCountByParking.set(s.parking_id,(streetCountByParking.get(s.parking_id)||0)+1);
  const segments=fail(await db.from("parking_street_segments").select("id,parking_id").in("parking_id",parkingIds));
  const segmentCountByParking=new Map();for(const s of segments)segmentCountByParking.set(s.parking_id,(segmentCountByParking.get(s.parking_id)||0)+1);

  // "Vehículos estacionados ahora" (mismo criterio que activeSessionsNow
  // del Dashboard: conteo en vivo, sin filtro de fecha).
  const activeRows=fail(await db.from("on_street_pilot_sessions").select("parking_id").in("parking_id",parkingIds).eq("status","ACTIVE"));
  const activeByParking=new Map();for(const r of activeRows)activeByParking.set(r.parking_id,(activeByParking.get(r.parking_id)||0)+1);

  // "Sesiones hoy" (started_at dentro del día de hoy, America/Santiago --
  // mismo resolvePeriodBounds ya usado en todo el módulo, nunca una
  // segunda lógica de timezone).
  const todayBounds=resolvePeriodBounds("today");
  const todayRows=todayBounds?fail(await db.from("on_street_pilot_sessions").select("parking_id").in("parking_id",parkingIds).gte("started_at",todayBounds.from).lte("started_at",todayBounds.to)):[];
  const todayByParking=new Map();for(const r of todayRows)todayByParking.set(r.parking_id,(todayByParking.get(r.parking_id)||0)+1);

  // "Recaudación hoy" (§4 de la corrección de fechas: evento financiero
  // real = committed_at para transacciones COMMITTED -- mismo criterio ya
  // aplicado en listOnStreetPaymentsPage, reutilizado aquí, no una segunda
  // regla).
  const revenueByParking=new Map();
  if(todayBounds){
    const committedRows=fail(await db.from("payment_transactions").select("amount,on_street_payment_intents!inner(parking_id)").eq("status","COMMITTED").in("on_street_payment_intents.parking_id",parkingIds).gte("committed_at",todayBounds.from).lte("committed_at",todayBounds.to));
    for(const row of committedRows){const pid=row.on_street_payment_intents?.parking_id;if(!pid)continue;revenueByParking.set(pid,(revenueByParking.get(pid)||0)+Number(row.amount||0));}
  }

  const rows=parkings.map(p=>({
    id:p.id,code:p.code,name:p.name,status:p.status,
    companyId:p.company_id,companyName:companyMap.get(p.company_id)?.trade_name||p.company_name||"—",
    areaCount:areaCountByParking.get(p.id)||0,streetCount:streetCountByParking.get(p.id)||0,segmentCount:segmentCountByParking.get(p.id)||0,
    activeVehicles:activeByParking.get(p.id)||0,sessionsToday:todayByParking.get(p.id)||0,revenueToday:revenueByParking.get(p.id)||0,
  }));
  return{rows,options:{parkings:parkings.map(p=>({id:p.id,name:p.name}))}};
}

// scopedParkings ya existente no filtra por status (el resto del módulo
// necesita ver estacionamientos en cualquier estado, p. ej. para
// administrar uno en borrador) -- Proyectos actuales SÍ necesita acotar a
// "vigente" (§4/§5 del brief: "actual" = ACTIVO, nunca "tuvo actividad
// hoy"). Envuelve scopedParkings en vez de duplicar su lógica de alcance.
// status ausente/vacío = sin filtrar (TODOS los estados reales) -- ver
// listOnStreetProjects. Con un status explícito, filtra a ese estado exacto
// (usado por el selector "Estado" del listado y por cualquier otro llamador
// que sí necesite acotar a uno solo).
async function scopedParkingsWithStatus(db,context,companyId,status){
  const parkings=await scopedParkings(db,context,companyId);
  return status?parkings.filter(p=>p.status===status):parkings;
}

// Ficha de Proyecto (Resumen): mismos datos que la fila del listado, para
// un único Estacionamiento, más el aislamiento por empresa
// (assertOwnedParking) -- reutiliza exactamente el mismo cálculo que
// listOnStreetProjects, sin una segunda definición de "recaudación
// hoy"/"vehículos ahora".
export async function getOnStreetProjectDetail(db,context,id){
  const parking=await db.from("parkings").select("id,code,name,status,company_id,company_name,type").eq("id",id).maybeSingle().then(r=>{if(r.error)throw r.error;return r.data;});
  if(!parking||parking.type!=="ON_STREET")return null;
  assertOwnedParking(parking,context);
  // Conteos de Tarifas/QR (pestaña Resumen / Revisión-Activación, corrección
  // UX "Proyectos On Street" 2026-08-29, punto 2): solo se calculan aquí
  // (ficha individual), no en listOnStreetProjects (listado de Proyectos
  // actuales) para no sumarle 2 consultas más por fila a ese listado, que no
  // los necesita.
  const[rateCount,qrCount]=await Promise.all([
    db.from("parking_rates").select("id",{count:"exact",head:true}).eq("parking_id",id).eq("status","ACTIVE").then(r=>r.count||0),
    db.from("on_street_qr_locations").select("id",{count:"exact",head:true}).eq("parking_id",id).then(r=>r.count||0),
  ]);
  const all=await listOnStreetProjects(db,context,{});
  const found=all.rows.find(r=>r.id===id);
  if(found)return{...found,rateCount,qrCount};
  // Respaldo defensivo: listOnStreetProjects({}) ya no filtra por status
  // (corrección 2026-08-30, ver más arriba) así que en la práctica "found"
  // siempre debería existir para un parking ON_STREET propio -- esta rama
  // solo cubriría un desalineamiento futuro entre scopedParkings y este
  // cálculo, recalculando areaCount/streetCount/segmentCount sin depender
  // de listOnStreetProjects.
  const company=(await companiesByIds(db,[parking.company_id]))[0]||null;
  const[areaCount,streetCount,segmentCount]=await Promise.all([
    db.from("parking_sectors").select("id",{count:"exact",head:true}).eq("parking_id",id).then(r=>r.count||0),
    db.from("parking_streets").select("id",{count:"exact",head:true}).eq("parking_id",id).then(r=>r.count||0),
    db.from("parking_street_segments").select("id",{count:"exact",head:true}).eq("parking_id",id).then(r=>r.count||0),
  ]);
  return{id:parking.id,code:parking.code,name:parking.name,status:parking.status,companyId:parking.company_id,companyName:company?.trade_name||parking.company_name||"—",areaCount,streetCount,segmentCount,rateCount,qrCount,activeVehicles:0,sessionsToday:0,revenueToday:0};
}
