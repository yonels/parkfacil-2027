import { boundedBody,rootActor,rpc,publicFailure } from '@/lib/contratacion/server';
import { getRequestAccessToken } from '@/lib/auth/authenticatedContext';
export const dynamic='force-dynamic';
export async function POST(request){try{
 const b=await boundedBody(request),a=await rootActor(request);
 if(b.action==='change_status'){
  if(b.status!=='inactive')throw Error('FRESH_COMMERCIAL_EVIDENCE_REQUIRED');
  return Response.json({ok:true,data:await rpc(a.client,'contratacion_integral_status',{p_id:b.id,p_status:'inactive',p_revision:0,p_reason:b.reason})},{headers:{'Cache-Control':'no-store'}});
 }
 if(b.action==='recoveries')return Response.json({ok:true,data:await rpc(a.client,'contratacion_recovery_inspect',{})},{headers:{'Cache-Control':'no-store'}});
 const origin=process.env.CONTRATACION_CRM_ORIGIN;if(!origin||new URL(origin).origin!==origin||!origin.startsWith('https://'))throw Error('CRM_ORIGIN_REQUIRED');
 if(b.action==='activate'&&String(b.reason||'').trim().length<8)throw Error('REASON_REQUIRED');
 const response=await fetch(origin+'/api/contratacion/administrar',{method:'POST',headers:{'Content-Type':'application/json',origin:process.env.CONTRATACION_ROOT_ORIGIN,authorization:`Bearer ${getRequestAccessToken(request)}`},body:JSON.stringify(b.action==='activate'?{...b,action:'prepare_activation'}:b),signal:AbortSignal.timeout(20000)});
 const result=await response.json();
 if(b.action==='activate'&&response.ok&&result.ok){
  await rpc(a.db,'contratacion_integral_evidence',{p_id:b.id,p_revision:result.data.revision,p_snapshot:result.data.snapshot});
  return Response.json({ok:true,data:await rpc(a.client,'contratacion_integral_status',{p_id:b.id,p_status:'active',p_revision:result.data.revision,p_reason:b.reason})},{headers:{'Cache-Control':'no-store'}});
 }
 return Response.json(result,{status:response.status,headers:{'Cache-Control':'no-store'}});
}catch{return publicFailure();}}
