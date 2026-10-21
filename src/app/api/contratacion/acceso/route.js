import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '@/lib/supabaseServer';
import { boundedBody, enrollmentActor, rpc, issuedAt, ENROLLMENT_COOKIE, cookieOptions, publicFailure } from '@/lib/contratacion/server';
import { exchangeTemporaryPin } from '@/lib/contratacion/temporary-pin.mjs';
import { accessScope } from '@/lib/contratacion/access-scope.mjs';
export const dynamic='force-dynamic';
export async function GET(request){try{const a=await enrollmentActor(request);return NextResponse.json({ok:true,scope:a.scope,...a.context},{headers:{'Cache-Control':'no-store'}});}catch{return publicFailure();}}
export async function POST(request){try{
 const b=await boundedBody(request),db=getSupabaseAdminClient();
 if(b.action==='logout'){const r=NextResponse.json({ok:true});r.cookies.set(ENROLLMENT_COOKIE,'',{...cookieOptions,maxAge:0});return r;}
 if(b.action==='login'){
  const email=String(b.email||'').trim().toLowerCase(),password=String(b.password||'');
  if(email.length>254||password.length>128)throw Error('INPUT_INVALID');
  const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  let token;
  if(/^\d{4}$/.test(password)){
   const r=await exchangeTemporaryPin({email,pin:password,auth:{admin:db.auth.admin,verifyOtp:args=>client.auth.verifyOtp(args)},allowCommercial:true,
    store:{reserveAttempt:e=>rpc(db,'contratacion_pin_attempt',{p_email:e}),confirm:(u,v)=>rpc(db,'contratacion_pin_success',{p_user:u,p_revision:v})},
    access:(u,e)=>rpc(db,'contratacion_pin_access',{p_user:u,p_enrollment:e})});token=r.accessToken;
  }else{const r=await client.auth.signInWithPassword({email,password});if(r.error)throw Error('AUTH_REQUIRED');token=r.data.session?.access_token;}
  const u=await db.auth.getUser(token);if(u.error||!u.data?.user)throw Error('AUTH_REQUIRED');
  const context=await rpc(db,'contratacion_context',{p_user:u.data.user.id,p_iat:issuedAt(token)});if(!context?.sessionValid)throw Error('SESSION_REVOKED');accessScope(context,{allowCommercial:true});
  const response=NextResponse.json({ok:true});response.cookies.set(ENROLLMENT_COOKIE,token,{...cookieOptions,maxAge:3300});return response;
 }
 if(b.action==='personal_password'){
  const a=await enrollmentActor(request),password=String(b.password||'');
  if(!a.context.mustChangePassword||password.length<12||password.length>128||password!==b.confirmPassword)throw Error('PASSWORD_POLICY');
  const record=await rpc(db,'contratacion_pin_attempt',{p_email:a.user.email,p_reauth_user:a.user.id});
  const {matchesPin}=await import('@/lib/contratacion/temporary-pin.mjs');if(record?.userId!==a.user.id||!await matchesPin(b.currentPin,record))throw Error('REAUTH_REQUIRED');
  await rpc(db,'contratacion_credential_begin',{p_user:a.user.id});
  const saved=await db.auth.admin.updateUserById(a.user.id,{password,app_metadata:{...a.user.app_metadata,enrollment_credentials_changed:true}});if(saved.error)throw Error('PASSWORD_UNCONFIRMED');
  const revoked=await db.auth.admin.signOut(a.token,'global');if(revoked.error)throw Error('SESSION_REVOCATION_UNCONFIRMED');
  await rpc(db,'contratacion_credential_finish',{p_user:a.user.id});
  const response=NextResponse.json({ok:true,mensaje:'Clave establecida. Ingrese nuevamente; el estado comercial de la empresa se conserva.'});response.cookies.set(ENROLLMENT_COOKIE,'',{...cookieOptions,maxAge:0});return response;
 }
 throw Error('ACTION_INVALID');
}catch{return publicFailure();}}
