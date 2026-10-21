import {pinVerifier,matchesPin} from './temporary-pin.mjs';
export function supabasePinStore(db){
 async function rpc(name,args){const r=await db.rpc(name,args);if(r.error)throw Error('PIN_STORE_UNAVAILABLE');return r.data;}
 return {
  async register(account,userId,enrollmentId){const v=await pinVerifier(account.password);await rpc('qa_pin_register',{p_user:userId,p_enrollment:enrollmentId,p_email:account.email,p_salt:v.salt,p_hash:v.hash});},
  reserveAttempt:email=>rpc('qa_pin_attempt',{p_email:email}),
  confirm:(userId,revision)=>rpc('qa_pin_success',{p_user:userId,p_revision:revision}),
  revoke:userId=>rpc('qa_pin_revoke',{p_user:userId}),
  access:(userId,enrollmentId)=>rpc('qa_pin_access',{p_user:userId,p_enrollment:enrollmentId}),
  async reauthenticate(email,pin,userId){const record=await rpc('qa_pin_attempt',{p_email:email,p_reauth_user:userId});return record?.userId===userId&&await matchesPin(pin,record);},
 };
}
