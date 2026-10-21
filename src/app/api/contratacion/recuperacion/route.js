import { createHash, randomBytes } from 'node:crypto';
import { temporaryPin,pinVerifier } from '@/lib/contratacion/temporary-pin.mjs';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '@/lib/supabaseServer';
import { boundedBody,rootActor,rpc,publicFailure,revokeSessions } from '@/lib/contratacion/server';
export const dynamic='force-dynamic';
const hash=x=>createHash('sha256').update(x).digest('hex');
const reply=body=>Response.json(body,{headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
export async function POST(request){try{
 const b=await boundedBody(request),db=getSupabaseAdminClient();
 if(b.action==='request'){
  // Identical response for unknown, ineligible, rate-limited and existing identities.
  try{await rpc(db,'contratacion_recovery_request',{p_email:String(b.email||'')});}catch{}
  return reply({ok:true,mensaje:'Si corresponde, ParkFacil revisará la solicitud de recuperación.'});
 }
 if(b.action==='issue'){
  const a=await rootActor(request);if(b.identityConfirmed!==true||String(b.reason||'').trim().length<8)throw Error('IDENTITY_VERIFICATION_REQUIRED');
  const token=randomBytes(32).toString('base64url');
  await rpc(a.client,'contratacion_recovery_issue',{p_id:b.id,p_hash:hash(token),p_reason:b.reason});
  const origin=process.env.CONTRATACION_CLIENT_ORIGIN;if(!(process.env.CONTRATACION_ALLOWED_ORIGINS||'').split(',').includes(origin))throw Error('CLIENT_ORIGIN_UNAPPROVED');
  return reply({ok:true,url:origin+'/contratacion/acceso#recuperar='+token});
 }
 if(b.action==='release'){
  const a=await rootActor(request);await rpc(a.client,'contratacion_recovery_release',{p_id:b.id,p_reason:b.reason,p_excluded:b.excluded===true});return reply({ok:true,mensaje:'Bloqueo liberado. Solicite un nuevo enlace tras verificar la identidad.'});
 }
 if(b.action==='renew_pin'){
  const a=await rootActor(request);if(b.identityConfirmed!==true)throw Error('IDENTITY_VERIFICATION_REQUIRED');
  const pin=temporaryPin(),v=await pinVerifier(pin);await rpc(a.client,'contratacion_pin_renew',{p_user:b.userId,p_salt:v.salt,p_hash:v.hash,p_reason:b.reason});
  return reply({ok:true,pin,mensaje:'PIN renovado. Entregar únicamente al representante verificado; el PIN anterior quedó revocado.'});
 }
 if(b.action==='complete'){
  const password=String(b.password||'');if(password.length<12||password.length>128||password!==b.confirmPassword||!String(b.token||'').match(/^[a-zA-Z0-9_-]{43}$/))throw Error('INPUT_INVALID');
  const claim=await rpc(db,'contratacion_recovery_claim',{p_hash:hash(b.token)});if(!claim?.userId)throw Error('TOKEN_INVALID');
  const u=await db.auth.admin.getUserById(claim.userId);if(u.error||!u.data?.user)throw Error('IDENTITY_UNAVAILABLE');
  // Obtain a server-only session to revoke all refresh sessions using the supported Auth API.
  const generated=await db.auth.admin.generateLink({type:'recovery',email:u.data.user.email});if(generated.error||generated.data?.user?.id!==claim.userId)throw Error('REVOCATION_SESSION_UNAVAILABLE');
  const isolated=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const verified=await isolated.auth.verifyOtp({token_hash:generated.data.properties.hashed_token,type:'recovery'});if(verified.error||verified.data?.user?.id!==claim.userId)throw Error('REVOCATION_SESSION_UNAVAILABLE');
  await revokeSessions(db,verified.data.session.access_token);
  const changed=await db.auth.admin.updateUserById(claim.userId,{password,app_metadata:{...u.data.user.app_metadata,enrollment_credentials_changed:true}});if(changed.error)throw Error('PASSWORD_UNCONFIRMED');
  await rpc(db,'contratacion_recovery_finish',{p_id:claim.requestId,p_user:claim.userId});
  return reply({ok:true,mensaje:'Clave establecida. Ingrese nuevamente; la recuperación no activa el servicio.'});
 }
 throw Error('ACTION_INVALID');
}catch{return publicFailure();}}
