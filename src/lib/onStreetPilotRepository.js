import "server-only";
import { createHash } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

export function clientFingerprint(request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const source = `${forwarded || "unknown"}|${request.headers.get("user-agent") || "unknown"}`;
  return createHash("sha256").update(source).digest("hex");
}

// Resuelve la tarifa real de cobro para una Ubicación QR. Decisión funcional
// "Proyectos On Street" (2026-08-29): cada QR nuevo tiene una tarifa
// explícita asignada (qr.rate_id, ver migración 20260829100500) -- se
// respeta ESA, sin ambigüedad. Solo si no hay rate_id (Ubicación QR
// histórica, previa a esta funcionalidad) o la tarifa asignada dejó de estar
// ACTIVE/vigente (reemplazada por una nueva versión sin actualizar el QR),
// se usa el fallback dinámico histórico (tarifa ACTIVE más reciente del
// estacionamiento) -- documentado, nunca silencioso: no se reasignan
// tarifas históricas, este fallback solo cubre exactamente esos dos casos.
async function resolveQrRate(db, qr, now) {
  if (qr.rate_id) {
    const pinned = await db.from("parking_rates").select("id,minute_amount,currency,status,valid_from,valid_until").eq("id", qr.rate_id).eq("billing_mode", "EFFECTIVE_MINUTE").maybeSingle();
    if (pinned.error) throw pinned.error;
    const r = pinned.data;
    if (r && r.status === "ACTIVE" && r.valid_from <= now && (!r.valid_until || r.valid_until > now)) {
      return { id: r.id, minute_amount: r.minute_amount, currency: r.currency };
    }
  }
  const dynamic = await db.from("parking_rates").select("id,minute_amount,currency").eq("parking_id", qr.parking_id).eq("billing_mode", "EFFECTIVE_MINUTE").eq("status", "ACTIVE").lte("valid_from", now).or(`valid_until.is.null,valid_until.gt.${now}`).order("valid_from", { ascending: false }).limit(1).maybeSingle();
  if (dynamic.error) throw dynamic.error;
  return dynamic.data;
}

export async function getPublicQrLocation(publicCode, db = getSupabaseAdminClient()) {
  const { data: qr, error } = await db.from("on_street_qr_locations").select("id,public_code,parking_id,sector_id,street_id,segment_id,rate_id,status").eq("public_code", publicCode).eq("status", "ACTIVE").maybeSingle();
  if (error) throw error;
  if (!qr) return null;
  const [parkingResult, sectorResult, streetResult, segmentResult] = await Promise.all([
    db.from("parkings").select("id,code,name,company_id,type,status").eq("id", qr.parking_id).eq("type", "ON_STREET").eq("status", "ACTIVE").maybeSingle(),
    db.from("parking_sectors").select("id,code,name,status").eq("id", qr.sector_id).maybeSingle(),
    db.from("parking_streets").select("id,name,district,status").eq("id", qr.street_id).maybeSingle(),
    db.from("parking_street_segments").select("id,code,name,from_number,to_number,street_side,status").eq("id", qr.segment_id).eq("status", "ACTIVE").maybeSingle(),
  ]);
  for (const result of [parkingResult, sectorResult, streetResult, segmentResult]) if (result.error) throw result.error;
  if (!parkingResult.data || !sectorResult.data || !streetResult.data || !segmentResult.data) return null;
  const now=new Date().toISOString();
  const [companyResult,rate]=await Promise.all([
    db.from("companies").select("business_name,trade_name,rut_number,rut_dv,email,phone").eq("id",parkingResult.data.company_id).maybeSingle(),
    resolveQrRate(db, qr, now),
  ]);
  if(companyResult.error)throw companyResult.error;
  return { qr, parking: parkingResult.data, sector: sectorResult.data, street: streetResult.data, segment: segmentResult.data, company:companyResult.data, rate };
}

// createPilotSession (RPC de 4 argumentos) y createFreePilotSession (sesión
// gratuita sin Webpay) se eliminaron: sin llamador en el flujo productivo
// (el único endpoint público que invocaba la versión gratuita se removió) y
// representaban una vía de estacionamiento sin cobro. El flujo vigente es
// exclusivamente createInitialPaymentIntent -> Webpay -> finalize_authorized_
// on_street_payment. Las funciones RPC correspondientes quedan sin invocar
// desde la aplicación; la migración incremental
// 20260824170000_remove_on_street_unpaid_session_rpcs.sql completa su
// retirada en la base de datos sin alterar datos históricos.

export async function getPublicPilotSession(token, db = getSupabaseAdminClient()) {
  const refreshed=await db.rpc("refresh_on_street_pilot_session",{p_public_token:token});
  if(refreshed.error){if(refreshed.error.message?.includes("PILOT_SESSION_NOT_FOUND"))return null;throw refreshed.error;}
  const session=refreshed.data;
  const { data: qr, error: qrError } = await db.from("on_street_qr_locations").select("public_code").eq("id", session.qr_location_id).single();
  if (qrError) throw qrError;
  const location = await getPublicQrLocation(qr.public_code, db);
  const extensions=await db.from("on_street_pilot_extensions").select("id,additional_minutes,rate_per_minute,simulated_amount,new_expires_at,created_at").eq("session_id",session.id).order("created_at");
  if(extensions.error)throw extensions.error;
  return location ? { session, location, extensions:extensions.data||[] } : null;
}

export async function closePilotSession(token, db = getSupabaseAdminClient()) {
  const { data, error } = await db.rpc("close_on_street_pilot_session", { p_public_token: token });
  if (error) throw error;
  return data;
}

// Barrido global: expira TODAS las sesiones ACTIVE vencidas de cualquier
// estacionamiento/ubicación, no solo las de un parking_id puntual. A
// diferencia de listParkingPilotSessions (que expira de paso, solo cuando
// un admin abre el panel de un estacionamiento específico), esta función es
// el mecanismo real, automático y server-side que garantiza que ninguna
// sesión vencida quede indefinidamente 'ACTIVE' bloqueando
// on_street_one_active_phone_location_idx. La invoca el cron de
// reconciliación de pagos (ver onStreetPaymentReconcileCore.mjs) antes de
// cada intento de recuperación.
export async function expireDueOnStreetPilotSessions(db = getSupabaseAdminClient()) {
  const { data, error } = await db.rpc("expire_on_street_pilot_sessions", { p_parking_id: null });
  if (error) throw error;
  return Number(data) || 0;
}

export async function listParkingPilotSessions(db, parkingId) {
  const expired=await db.rpc("expire_on_street_pilot_sessions",{p_parking_id:parkingId});if(expired.error)throw expired.error;
  const { data: sessions, error } = await db.from("on_street_pilot_sessions").select("id,qr_location_id,phone_normalized,status,started_at,ended_at,duration_seconds,purchased_minutes,rate_per_minute,simulated_amount,expires_at").eq("parking_id", parkingId).order("started_at", { ascending: false }).limit(250);
  if (error) throw error;
  const qrIds = [...new Set((sessions || []).map((row) => row.qr_location_id))];
  if (!qrIds.length) return [];
  const { data: locations, error: locationError } = await db.from("on_street_qr_locations").select("id,sector_id,street_id,segment_id").in("id", qrIds);
  if (locationError) throw locationError;
  const segmentIds = [...new Set((locations || []).map((row) => row.segment_id))];
  const sectorIds=[...new Set((locations||[]).map(row=>row.sector_id))],streetIds=[...new Set((locations||[]).map(row=>row.street_id))];
  const [segmentResult,sectorResult,streetResult]=await Promise.all([db.from("parking_street_segments").select("id,code,name").in("id",segmentIds),db.from("parking_sectors").select("id,code,name").in("id",sectorIds),db.from("parking_streets").select("id,name").in("id",streetIds)]);
  if(segmentResult.error)throw segmentResult.error;if(sectorResult.error)throw sectorResult.error;if(streetResult.error)throw streetResult.error;const segments=segmentResult.data;
  const locationMap = new Map((locations || []).map((row) => [row.id, row]));
  const segmentMap = new Map((segments || []).map((row) => [row.id, row]));
  const sectorMap=new Map((sectorResult.data||[]).map(row=>[row.id,row])),streetMap=new Map((streetResult.data||[]).map(row=>[row.id,row]));
  const sessionIds=(sessions||[]).map(x=>x.id);const [extensionRows,notificationRows]=sessionIds.length?await Promise.all([db.from("on_street_pilot_extensions").select("id,session_id,additional_minutes,rate_per_minute,simulated_amount,previous_expires_at,new_expires_at,origin,created_at").in("session_id",sessionIds).order("created_at"),db.from("on_street_pilot_notifications").select("id,session_id,type,scheduled_at,sent_at,status,attempts").in("session_id",sessionIds).order("scheduled_at")]):[{data:[],error:null},{data:[],error:null}];if(extensionRows.error)throw extensionRows.error;if(notificationRows.error)throw notificationRows.error;const bySession=new Map(),noticesBySession=new Map();for(const x of extensionRows.data||[]){const list=bySession.get(x.session_id)||[];list.push(x);bySession.set(x.session_id,list)}for(const x of notificationRows.data||[]){const list=noticesBySession.get(x.session_id)||[];list.push(x);noticesBySession.set(x.session_id,list)}
  return (sessions || []).map((session) => {const location=locationMap.get(session.qr_location_id),extensions=bySession.get(session.id)||[],extendedMinutes=extensions.reduce((sum,x)=>sum+Number(x.additional_minutes),0),extendedAmount=extensions.reduce((sum,x)=>sum+Number(x.simulated_amount),0);return{...session,original_minutes:session.purchased_minutes==null?null:Number(session.purchased_minutes)-extendedMinutes,initial_simulated_amount:session.simulated_amount==null?null:Number(session.simulated_amount)-extendedAmount,extensions,notifications:noticesBySession.get(session.id)||[],extension_count:extensions.length,sector:sectorMap.get(location?.sector_id)||null,street:streetMap.get(location?.street_id)||null,segment:segmentMap.get(location?.segment_id)||null}});
}
