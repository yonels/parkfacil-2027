// Local transport double. No remote fetch is ever forwarded.
import {randomUUID,randomBytes} from 'node:crypto';
const fetchLocal=globalThis.fetch;let cleanupFailure=process.env.QA_TEST_CLEANUP_FAIL==='true';
const root={id:'00000000-0000-4000-8000-000000000001',email:'root@example.invalid',app_metadata:{role:'platform_admin'}};
const users=new Map([[root.id,root]]),passwords=new Map([[root.id,'local-root-test-only']]),tokens=new Map(),links=new Map(),pins=new Map(),jobs=new Map(),flows=new Map(),companies=new Map(),members=[],parkings=[],history=[];
const reply=(data,status=200)=>Response.json(data,{status});
const fail=()=>reply({message:'LOCAL_DOUBLE_REJECTED',code:'LOCAL_DOUBLE_REJECTED'},400);
function session(user){const access_token=randomBytes(32).toString('hex');tokens.set(access_token,user.id);return {user,access_token,refresh_token:'local-only',token_type:'bearer',expires_in:3600};}
function identity(headers){return users.get(tokens.get(new Headers(headers).get('authorization')?.replace('Bearer ','')));}
function access(userId,enrollmentId){const j=jobs.get(enrollmentId),c=companies.get(j?.operational?.companyId),m=members.find(x=>x.user_id===userId&&x.company_id===c?.id);return c&&m?{companyId:c.id,companyStatus:c.status,memberStatus:m.status,role:m.role,pinAvailable:!!pins.get(userId)&&!pins.get(userId).consumed&&!pins.get(userId).disabled,everActivated:history.some(h=>h.company_id===c.id&&h.status==='active')}:null;}
globalThis.fetch=async(input,options={})=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url),method=options.method||'GET';
 if(url.origin==='http://127.0.0.1:14321')return fetchLocal(input,options);
 if(!['yghhmhxqhjluldthvsse.supabase.co','pzpmioutzlnkbsssupip.supabase.co'].includes(url.hostname))throw Error('REMOTE_NETWORK_FORBIDDEN_IN_TEST');
 const b=options.body?JSON.parse(options.body):{},path=url.pathname;
 if(path==='/auth/v1/token'){const user=[...users.values()].find(u=>u.email===b.email&&passwords.get(u.id)===b.password);return user?reply(session(user)):fail();}
 if(path==='/auth/v1/user')return identity(options.headers)?reply(identity(options.headers)):fail();
 if(path==='/auth/v1/admin/users'&&method==='POST'){
 if([...users.values()].some(u=>u.email===b.email))return reply({code:'email_exists',message:'LOCAL_DUPLICATE'},422);
 const u={id:randomUUID(),email:b.email,app_metadata:b.app_metadata,user_metadata:b.user_metadata};users.set(u.id,u);if(b.password)passwords.set(u.id,b.password);return reply(u);
 }
 if(path==='/auth/v1/admin/users')return reply({users:[...users.values()]});
 if(path.startsWith('/auth/v1/admin/users/')){const u=users.get(path.split('/').at(-1));if(!u)return fail();if(method==='PUT'){if(b.password)passwords.set(u.id,b.password);if(b.app_metadata)u.app_metadata=b.app_metadata;if(b.email)u.email=b.email;}return reply(u);}
 if(path==='/auth/v1/admin/generate_link'){const u=[...users.values()].find(x=>x.email===b.email);if(!u)return fail();const token=randomBytes(32).toString('hex');links.set(token,u.id);return reply({...u,hashed_token:token,verification_type:'magiclink'});}
 if(path==='/auth/v1/verify'){const id=links.get(b.token_hash);links.delete(b.token_hash);return id?reply(session(users.get(id))):fail();}
 if(path==='/auth/v1/logout')return reply({});
 if(path.startsWith('/rest/v1/rpc/')){
 const name=path.split('/').at(-1);
 if(name==='contratacion_begin'){
 let j=jobs.get(b.p_id);if(j&&j.fingerprint!==b.p_fingerprint)return fail();
 if(j&&j.state!=='failed')return reply({...j,claimed:false});
 if(!j){j={id:b.p_id,state:'processing',fingerprint:b.p_fingerprint,payload:b.p_payload,credentials:b.p_credentials,created_at:new Date().toISOString()};jobs.set(j.id,j);}
 j.state='processing';return reply({...j,claimed:true});
 }
 if(name==='contratacion_complete'){const j=jobs.get(b.p_id);j.state='completed';j.operational=b.p_operational;return reply(null);}
 if(name==='contratacion_fail'){jobs.get(b.p_id).state='failed';return reply(null);}
 if(name==='contratacion_operational_finish'){
 const j=jobs.get(b.p_id);if(j.operational)return reply(j.operational);
 const companyId='company-'+b.p_id,parkingId=randomUUID();companies.set(companyId,{id:companyId,business_name:b.p_payload.empresa,status:'inactive'});
 for(const a of b.p_accounts)members.push({user_id:a.id,company_id:companyId,role:a.role,full_name:a.fullName,status:'inactive',must_change_password:true});
 parkings.push({id:parkingId,company_id:companyId,name:b.p_payload.estacionamientoNombre,status:'DRAFT'});return reply({companyId,parkingId});
 }
 if(name==='qa_pin_audit_reveal')return users.get(b.p_actor)?.app_metadata.role==='platform_admin'?reply(null):fail();
 if(name==='qa_pin_register'){if(!pins.has(b.p_user))pins.set(b.p_user,{userId:b.p_user,enrollmentId:b.p_enrollment,email:b.p_email,salt:b.p_salt,hash:b.p_hash,revision:1,count:0,consumed:false});return reply(null);}
 if(name==='qa_pin_attempt'){const p=[...pins.values()].find(p=>p.email===b.p_email),u=users.get(p?.userId);if(!p||p.disabled||u?.app_metadata.qa_credentials_changed||(p.consumed&&p.userId!==b.p_reauth_user)||++p.count>5)return reply(null);return reply({...p});}
 if(name==='qa_pin_success'){const p=pins.get(b.p_user);if(!p||p.consumed||p.revision!==b.p_revision)return reply(false);p.count=0;p.revision++;return reply(true);}
 if(name==='qa_pin_revoke'&&cleanupFailure){cleanupFailure=false;return fail();}
 if(name==='qa_pin_revoke'){pins.get(b.p_user).disabled=true;return reply(null);}
 if(name==='qa_pin_access')return reply(access(b.p_user,b.p_enrollment));
 if(name==='qa_contract_save'){const f=flows.get(b.p_job)||{revision:0,data:{}};if(f.revision!==b.p_revision)return fail();flows.set(b.p_job,{revision:f.revision+1,data:b.p_data});return reply(null);}
 if(name==='contratacion_root_change_status'){
 const actor=identity(options.headers);if(actor?.app_metadata.role!=='platform_admin')return fail();
 if(b.p_status==='active'&&(!b.p_evidence?.contractCompleted||!b.p_evidence.paymentVerified||!b.p_evidence.quoteAccepted))return fail();
 companies.get(b.p_company).status=b.p_status;for(const m of members.filter(m=>m.company_id===b.p_company))m.status=b.p_status;
 history.push({company_id:b.p_company,status:b.p_status});return reply({changed:true,status:b.p_status});
 }
 throw Error('UNMODELED_LOCAL_RPC');
 }
 if(path.startsWith('/rest/v1/')){
 const table=path.split('/').at(-1),rows=table==='contratacion_jobs'?[...jobs.values()]:table==='companies'?[...companies.values()]:table==='company_members'?members:table==='parkings'?parkings:table==='qa_contract_events'?[]:table==='qa_contract_flow'?[...flows].map(([job_id,f])=>({job_id,...f})):null;
 if(!rows)throw Error('UNMODELED_LOCAL_TABLE');
 const matches=rows.filter(row=>[...url.searchParams].every(([key,val])=>!val.startsWith('eq.')||String(row[key])===val.slice(3)));
 if(method==='PATCH'){for(const row of matches)Object.assign(row,b);return reply(null);}
 const single=new Headers(options.headers).get('accept')?.includes('vnd.pgrst.object');return reply(single?(matches[0]||null):matches);
 }
 throw Error('UNMODELED_LOCAL_REQUEST');
};

globalThis[Symbol.for("parkfacil.qa.isolatedTransport")]=true;

