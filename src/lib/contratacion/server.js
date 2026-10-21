import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '@/lib/supabaseServer';
import { getRequestAccessToken } from '@/lib/auth/authenticatedContext';
import { accessScope } from './access-scope.mjs';
export const ENROLLMENT_COOKIE='pf_enrollment';
export const cookieOptions={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/'};
// Prueba integrada local (SOL-2026-10-16-001): solo fuera de producción y con CONTRATACION_ENVIRONMENT=local se acepta
// un CRM en http://localhost o http://127.0.0.1; en cualquier otro caso se exige https.
export function crmOrigin(){
  const origin=process.env.CONTRATACION_CRM_ORIGIN;if(!origin)throw Error('CRM_ORIGIN_REQUIRED');const url=new URL(origin);
  const local=process.env.NODE_ENV!=='production'&&process.env.CONTRATACION_ENVIRONMENT==='local'&&url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname);
  if(url.origin!==origin||(url.protocol!=='https:'&&!local))throw Error('CRM_ORIGIN_REQUIRED');return origin;
}
// Revoca todas las sesiones del usuario antes de cambiar su clave. Una sesión ya inexistente cuenta como revocada:
// algunas versiones de Supabase Auth cierran las sesiones por su cuenta (hallado en la prueba integrada local 2026-10-21).
export async function revokeSessions(db,accessToken){
  const r=await db.auth.admin.signOut(accessToken,'global');
  if(r.error&&r.error.name!=='AuthSessionMissingError'&&![401,403,404].includes(r.error.status))throw Error('SESSION_REVOCATION_UNCONFIRMED');
}
export function enabled() { if(process.env.CONTRATACION_INTEGRAL_ENABLED!=='true')throw Error('UNAVAILABLE'); }
export async function boundedBody(request) {
  enabled();
  const allowed=(process.env.CONTRATACION_ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
  if(!allowed.includes(request.headers.get('origin')))throw Error('ORIGIN_REQUIRED');
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw Error('JSON_REQUIRED');
  const reader=request.body?.getReader();if(!reader)throw Error('BODY_REQUIRED');let size=0;const chunks=[];
  for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>12000){await reader.cancel();throw Error('BODY_LIMIT');}chunks.push(r.value);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function rpc(db,name,args){const r=await db.rpc(name,args);if(r.error)throw Error('PERSISTENCE_FAILED');return r.data;}
export function issuedAt(token){try {return JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).iat||0;}catch{return 0;}}
export function enrollmentToken(request){return request.cookies?.get(ENROLLMENT_COOKIE)?.value||'';}
export async function enrollmentActor(request){
  enabled();const db=getSupabaseAdminClient(),token=enrollmentToken(request);
  const r=await db.auth.getUser(token);if(r.error||!r.data?.user)throw Error('AUTH_REQUIRED');
  const user=r.data.user,context=await rpc(db,'contratacion_context',{p_user:user.id,p_iat:issuedAt(token)});
  if(!context?.sessionValid)throw Error('SESSION_REVOKED');
  const scope=accessScope(context,{allowCommercial:true});return {db,user,context,scope,token};
}
export async function rootActor(request){
  enabled();const db=getSupabaseAdminClient(),token=getRequestAccessToken(request);
  const r=await db.auth.getUser(token),user=r.data?.user;
  if(r.error||!user||user.app_metadata?.role!=='platform_admin'||user.deleted_at||(user.banned_until&&new Date(user.banned_until)>new Date()))throw Error('ROOT_REQUIRED');
  const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  return {db,user,client};
}
export const publicFailure=()=>Response.json({ok:false,mensaje:'No se pudo completar la operación. Revise los datos o contacte a ParkFacil.'},{status:400,headers:{'Cache-Control':'no-store'}});
