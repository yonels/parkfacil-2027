import {recoveryQueue} from './recovery-qa.mjs';
const recovery=recoveryQueue();
import {exchangeTemporaryPin} from './temporary-pin.mjs';
import {supabasePinStore} from './pin-supabase-store.mjs';
import {accessScope,requireOperational} from './access-scope.mjs';
import {welcomePreview} from './welcome-preview.mjs';
import {updateAccount} from './account-access.mjs';
import http from 'node:http';import fs from 'node:fs/promises';import {randomBytes,createHash} from 'node:crypto';import {createClient} from '@supabase/supabase-js';
import {assertTestEnvironment} from '../src/lib/contratacionTestEnvironment.mjs';import {provision,unseal} from '../src/lib/contratacionProvision.mjs';import {prepararContratacion,DOCUMENTOS_CONTRATACION} from './formulario.mjs';import {validarRut,validarCorreo} from './validacion.mjs';import {transition,activationEvidence} from './flow.mjs';
const config=JSON.parse(await fs.readFile(new URL('../entorno-solo-pruebas.json',import.meta.url)));
assertTestEnvironment({crmUrl:process.env.QA_CRM_URL,operationalUrl:process.env.QA_OPERATIONAL_URL,approvedCrmRef:config.crmRef,approvedOperationalRef:config.operationalRef,mailMode:process.env.QA_MAIL_MODE,paymentMode:process.env.QA_PAYMENT_MODE});
if(!/^[a-f0-9]{64}$/i.test(process.env.QA_ENCRYPTION_KEY||''))throw Error('Configuración QA incompleta.');
for(const d of DOCUMENTOS_CONTRATACION){const bytes=await fs.readFile(new URL('.'+d.url,import.meta.url));if(createHash('sha256').update(bytes).digest('hex')!==d.sha256)throw Error('PDF no coincide con versión aprobada.');}
const opts={auth:{persistSession:false,autoRefreshToken:false}};
const crm=createClient(process.env.QA_CRM_URL,process.env.QA_CRM_SERVICE_KEY,opts),op=createClient(process.env.QA_OPERATIONAL_URL,process.env.QA_OPERATIONAL_SERVICE_KEY,opts);
const pinEnabled=process.env.QA_TEMPORARY_PIN_ENABLED==='true',pinStore=pinEnabled?supabasePinStore(op):null;
const isolatedTransport=process.env.QA_ISOLATED_TRANSPORT==='true';if(isolatedTransport&&!globalThis[Symbol.for('parkfacil.qa.isolatedTransport')])throw Error('ISOLATED_TRANSPORT_REQUIRED');
const sessions=new Map(),loginAttempts=new Map(),accountAttempts=new Map(),accountLocks=new Set();const port=Number(process.env.QA_LOCAL_PORT||4320),origin='http://127.0.0.1:'+port;
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Puerto local QA inválido.');
const uuid=x=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x||'');
function checked(r){if(r.error)throw Error('La operación de QA no se completó. Actualice y revise su estado antes de reintentar.');return r.data;}
async function actor(s){if(!s.accessToken)throw Error('Inicie sesión.');const user=checked(await op.auth.getUser(s.accessToken))?.user;if(!user)throw Error('Sesión vencida. Ingrese nuevamente.');if(user.app_metadata?.role==='platform_admin')return {id:user.id,role:'root',user};
if(pinEnabled){
 const enrollmentId=user.app_metadata?.enrollment_id;if(!uuid(enrollmentId))throw Error('No se pudo autorizar el acceso.');
 const state=await pinStore.access(user.id,enrollmentId),scope=accessScope(state,{allowCommercial:true});
 return {id:user.id,role:'client',user,scope,companyId:state.companyId,accountRole:state.role,mustChangePassword:user.app_metadata?.credential_scheme==='qa_pin_v1'&&!user.app_metadata?.qa_credentials_changed};
}
return {id:user.id,role:'client',user};}
async function jobFor(id,a){if(!uuid(id))throw Error('Solicitud inválida.');const j=checked(await crm.from('contratacion_jobs').select('id,state,payload,operational,empresa_id,created_at').eq('id',id).single());
 if(a.role!=='root'){
 if(a.user.app_metadata?.enrollment_id!==id)throw Error('Esta solicitud no pertenece al representante conectado.');
 const member=checked(await op.from('company_members').select('role').eq('company_id',j.operational?.companyId).eq('user_id',a.id).maybeSingle());
 if(member?.role!=='company_admin')throw Error('Solo el administrador puede acceder a la contratación de su empresa.');
 }return j;}
async function view(id,a){const j=await jobFor(id,a);const f=checked(await crm.from('qa_contract_flow').select('revision,data').eq('job_id',id).maybeSingle())||{revision:0,data:{}};
 const companyId=j.operational?.companyId;
 const company=companyId?checked(await op.from('companies').select('id,business_name,status').eq('id',companyId).single()):null;
 const members=companyId?checked(await op.from('company_members').select('user_id,role,full_name,status,must_change_password').eq('company_id',companyId)):[];
 for(const m of members){m.email=checked(await op.auth.admin.getUserById(m.user_id)).user.email;}
 const events=a.role==='root'?checked(await crm.from('qa_contract_events').select('action,actor_id,created_at').eq('job_id',id).order('created_at')):[];
 return {id:j.id,state:j.state,company,members,flow:f,events,representative:j.payload.representanteCorreo,companyEmail:j.payload.correo,operationalAllowed:!a.mustChangePassword&&company?.status==='active'&&members.some(m=>m.user_id===a.id&&m.status==='active'&&m.role==='company_admin'),mail:welcomePreview({company,members,previouslyActivated:pinEnabled&&companyId&&members[0]?.user_id?(await pinStore.access(members[0]?.user_id,j.id))?.everActivated:false})};
}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");
 try{
 if(req.headers.host!=='127.0.0.1:'+port)throw Error('Abra exclusivamente '+origin);
 let sid=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('pfqa='))?.slice(5),s=sessions.get(sid);
 if(!s||s.expires<Date.now()){sid=randomBytes(32).toString('hex');s={csrf:randomBytes(24).toString('hex'),opened:new Set(),expires:Date.now()+3600000};sessions.set(sid,s);res.setHeader('Set-Cookie',`pfqa=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`);}
 for(const [key,v] of sessions)if(v.expires<Date.now())sessions.delete(key);
 const path=new URL(req.url,origin).pathname;
 const json=(v,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(v));};
 if(req.method==='GET'&&(path==='/'||path==='/gestion')){res.setHeader('Content-Type','text/html; charset=utf-8');let html=await fs.readFile(new URL(path==='/gestion'?'gestion.html':'index.html',import.meta.url),'utf8');if(isolatedTransport)html=html.replace(/<body\b[^>]*>/,match=>match+'<aside style="padding:12px;background:#fff1b8;color:#332900">SIMULACIÓN LOCAL AISLADA · Sin bases remotas · Los datos se pierden al reiniciar.</aside>');res.end(html);return;}
 if(req.method==='GET'&&path==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(await fs.readFile(new URL('app.js',import.meta.url)));return;}
 if(req.method==='GET'&&path==='/api/session'){let a=null;try{a=await actor(s)}catch{}json({csrf:s.csrf,temporaryPinEnabled:pinEnabled,actor:a?{role:a.role,email:a.user.email,mustChangePassword:!!a.mustChangePassword,scope:a.scope,accountRole:a.accountRole}:null});return;}
 if(req.method==='GET'&&path.startsWith('/documentos/')){const d=DOCUMENTOS_CONTRATACION.find(d=>d.url===path);if(!d)throw Error('Documento inexistente.');s.opened.add(d.id);res.setHeader('Content-Type','application/pdf');res.end(await fs.readFile(new URL('.'+d.url,import.meta.url)));return;}
 if(req.method==='GET'&&path==='/api/operational'){
 const a=await actor(s),companyId=requireOperational(a);
 const company=checked(await op.from('companies').select('id,business_name,status').eq('id',companyId).single());
 const parkings=checked(await op.from('parkings').select('id,name,status').eq('company_id',companyId));
 json({company,parkings});return;
 }
 if(req.method==='GET'&&path==='/api/recovery-requests'){const a=await actor(s);if(a.role!=='root')throw Error('Solo Root.');json(recovery.list());return;}
 if(req.method==='GET'&&path==='/api/jobs'){const a=await actor(s);if(a.accountRole==='operator')throw Error('La gestión web está restringida al administrador.');let q=crm.from('contratacion_jobs').select('id,state,payload,created_at').order('created_at',{ascending:false}).limit(100);if(a.role!=='root'){if(!uuid(a.user.app_metadata?.enrollment_id))throw Error('Cuenta sin contratación asociada.');q=q.eq('id',a.user.app_metadata.enrollment_id);}
 json(checked(await q).map(j=>({id:j.id,empresa:j.payload.empresa,state:j.state})));return;}
 if(req.method==='GET'&&path==='/api/view'){const a=await actor(s);json(await view(new URL(req.url,origin).searchParams.get('id'),a));return;}
 if(req.method!=='POST'||req.headers.origin!==origin||req.headers['x-qa-csrf']!==s.csrf||!req.headers['content-type']?.startsWith('application/json'))throw Error('Solicitud local no autorizada.');
 let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>40000)throw Error('Solicitud demasiado extensa.');}const b=JSON.parse(raw);
 if(path==='/api/forgot-password'){recovery.request(b.email);json({ok:true});return;}
 if(path==='/api/recovery-issue'){
 const a=await actor(s);if(a.role!=='root'||b.identityConfirmed!==true)throw Error('Root debe verificar la identidad del solicitante.');
 const token=await recovery.issue(b.id,async email=>{
 for(let page=1;page<=100;page++){const users=checked(await op.auth.admin.listUsers({page,perPage:100})).users;const u=users.find(u=>u.email?.toLowerCase()===email);if(u){if(!pinStore||!uuid(u.app_metadata?.enrollment_id)||u.app_metadata.role==='platform_admin')return null;const state=await pinStore.access(u.id,u.app_metadata.enrollment_id);return state?.role==='company_admin'&&state.companyStatus==='active'&&state.memberStatus==='active'?u.id:null;}if(users.length<100)break;}return null;
 });json({url:origin+'/gestion#recuperar='+token});return;
 }
 if(path==='/api/recovery-complete'){
 if(String(b.password||'')!==String(b.confirmPassword||''))throw Error('Las claves no coinciden.');
 await recovery.complete(b.token,String(b.password||''),async(userId,password)=>{
 const u=checked(await op.auth.admin.getUserById(userId)).user;
 const state=await pinStore.access(userId,u.app_metadata.enrollment_id);if(state?.companyStatus!=='active'||state.memberStatus!=='active'||state.role!=='company_admin')throw Error('Cuenta no disponible.');
 checked(await op.auth.admin.updateUserById(userId,{password,app_metadata:{...u.app_metadata,qa_credentials_changed:true},user_metadata:{...u.user_metadata,must_change_password:false}}));
 for(const [key,value] of sessions)if(value.userId===userId)sessions.delete(key);
 });json({ok:true});return;
 }
 if(path==='/api/login'){
 const loginKey=String(b.email||'').trim().toLowerCase();const attempts=loginAttempts.get(loginKey)||{count:0,until:Date.now()+600000};if(attempts.until<Date.now()){attempts.count=0;attempts.until=Date.now()+600000;}if(attempts.count>=5)throw Error('Espere diez minutos antes de reintentar el ingreso.');attempts.count++;loginAttempts.set(loginKey,attempts);
 const authClient=createClient(process.env.QA_OPERATIONAL_URL,process.env.QA_OPERATIONAL_SERVICE_KEY,opts);let r,pinLogin=false;
 if(pinEnabled&&/^\d{4}$/.test(String(b.password||''))){
 const exchanged=await exchangeTemporaryPin({email:loginKey,pin:b.password,store:pinStore,auth:authClient.auth,access:pinStore.access,allowCommercial:true});
 pinLogin=true;r={data:{user:{id:exchanged.userId},session:{access_token:exchanged.accessToken}}};
 }else{r=await authClient.auth.signInWithPassword({email:loginKey,password:String(b.password||'')});if(r.error)throw Error('No se pudo autorizar el acceso.');}
 if(pinEnabled){const verified=await actor({accessToken:r.data.session.access_token});if(pinLogin&&!verified.mustChangePassword)throw Error('No se pudo autorizar el acceso.');}
 sessions.delete(sid);sid=randomBytes(32).toString('hex');s={csrf:randomBytes(24).toString('hex'),opened:new Set(),expires:Date.now()+3600000,userId:r.data.user.id,accessToken:r.data.session.access_token};sessions.set(sid,s);res.setHeader('Set-Cookie',`pfqa=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`);loginAttempts.delete(loginKey);json({ok:true});return;
 }
 if(path==='/api/logout'){sessions.delete(sid);json({ok:true});return;}
 if(path==='/api/enroll'){
 if(!uuid(b.requestId))throw Error('Identificador inválido.');
 if(DOCUMENTOS_CONTRATACION.some(d=>!s.opened.has(d.id)))throw Error('Abra ambos PDF antes de aceptar.');
 const p=prepararContratacion(b,{validarRut,validarCorreo});if(p.error)throw Error(p.error);
 const result=await provision({crm,operational:op,id:b.requestId,registro:p.registro,key:process.env.QA_ENCRYPTION_KEY,pinStore});json(result);return;
 }
 const a=await actor(s);
 if(path==='/api/temporary-password'){
 if(!pinEnabled||a.role!=='client'||!a.mustChangePassword)throw Error('Cambio temporal no disponible.');
 if(accountLocks.has(a.companyId))throw Error('Hay un cambio de accesos en curso.');accountLocks.add(a.companyId);
 try{
 const password=String(b.password||'');
 if(password.length<8||password.length>128||password!==b.confirmPassword)throw Error('Ingrese y confirme una clave personal de entre 8 y 128 caracteres.');
 if(!await pinStore.reauthenticate(a.user.email,String(b.currentPin||''),a.id))throw Error('No se pudo autorizar el acceso.');
 const saved=await op.auth.admin.updateUserById(a.id,{password,app_metadata:{...a.user.app_metadata,qa_credentials_changed:true},user_metadata:{...a.user.user_metadata,must_change_password:false}});
 if(saved.error||saved.data?.user?.id!==a.id)throw Error('No se pudo completar el cambio de clave.');
 // Auth metadata blocks reuse even if the following cleanup fails.
 for(const [key,value] of sessions)if(value.userId===a.id)sessions.delete(key);
 let pendingState=false;try{await pinStore.revoke(a.id);}catch{pendingState=true;}
 try{checked(await op.from('company_members').update({must_change_password:false}).eq('user_id',a.id).eq('company_id',a.companyId));}catch{pendingState=true;}
 json({ok:true,pendingState});return;
 }finally{accountLocks.delete(a.companyId);}
 }
 if(a.mustChangePassword)throw Error('Cambie primero su clave temporal.');
 const j=await jobFor(b.id,a);
 if(path==='/api/credentials'){
 const adminReveal=a.role==='client'&&a.accountRole==='company_admin'&&a.scope==='operational'&&a.companyId===j.operational?.companyId;
 if(a.role!=='root'&&!adminReveal)throw Error('Solo Root o el administrador activo de esta empresa puede consultar los PIN temporales de sus operadores.');
 const d=checked(await crm.from('contratacion_jobs').select('credentials').eq('id',b.id).single());if(!d.credentials)throw Error('Las claves temporales ya no están disponibles.');
 const state=await view(b.id,a),rows=[];if(pinStore&&a.role==='root')checked(await op.rpc('qa_pin_audit_reveal',{p_actor:a.id,p_enrollment:b.id}));
 for(const x of unseal(d.credentials,process.env.QA_ENCRYPTION_KEY,b.id)){
 const member=state.members.find(m=>m.email===x.email);if(!member)continue;
 if(adminReveal&&(member.role!=='operator'||member.status!=='active'||x.scheme!=='qa_pin_v1'||x.role!=='operator'))continue;
 const u=checked(await op.auth.admin.getUserById(member.user_id)).user;
 if(x.scheme==='qa_pin_v1'&&(!pinStore||!(await pinStore.access(member.user_id,b.id))?.pinAvailable))continue;
 if(!u.app_metadata?.qa_credentials_changed)rows.push({role:x.role,user:x.email,password:x.password});
 }
 if(adminReveal)console.info(JSON.stringify({event:'qa_operator_pin_reveal',actorId:a.id,enrollmentId:b.id,companyId:a.companyId,count:rows.length}));
 json(rows);return;
 }
 if(path==='/api/account'){
 if(a.role==='root')throw Error('Ingrese como administrador del cliente para cambiar estos accesos.');
 const attempts=accountAttempts.get(a.id)||{count:0,until:Date.now()+600000};if(attempts.until<Date.now()){attempts.count=0;attempts.until=Date.now()+600000;}if(attempts.count>=5)throw Error('Espere diez minutos antes de volver a confirmar la clave.');attempts.count++;accountAttempts.set(a.id,attempts);
 const state=await view(b.id,a),companyId=state.company?.id;
 if(accountLocks.has(companyId))throw Error('Hay un cambio de accesos en curso. Espere y actualice.');accountLocks.add(companyId);
 try{
 const authClient=createClient(process.env.QA_OPERATIONAL_URL,process.env.QA_OPERATIONAL_SERVICE_KEY,opts);
 const result=await updateAccount({admin:op.auth.admin,actorId:a.id,company:state.company,members:state.members,targetId:b.targetId,input:b,reauthenticate:async password=>{
 const r=await authClient.auth.signInWithPassword({email:a.user.email,password});
 if(r.error||r.data.user?.id!==a.id)return false;
 await authClient.auth.signOut({scope:'local'});return true;
 }});
 if(b.password){try{checked(await op.from('company_members').update({must_change_password:false}).eq('user_id',result.userId).eq('company_id',companyId));}catch{result.pendingState=true;}}
 accountAttempts.delete(a.id);
 for(const [key,value] of sessions)if(value.userId===result.userId)sessions.delete(key);
 json(result);return;
 }finally{accountLocks.delete(companyId);}
 }
 if(path==='/api/action'){
 const state=await view(b.id,a);
 if(['activate','deactivate'].includes(b.action)){
 if(a.role!=='root')throw Error('Solo Root cambia el estado.');
 if(!String(b.reason||'').trim())throw Error('Indique el motivo del cambio.');
 const evidence=b.action==='activate'?activationEvidence(state.flow.data):null;
 const rootClient=createClient(process.env.QA_OPERATIONAL_URL,process.env.QA_OPERATIONAL_SERVICE_KEY,{...opts,global:{headers:{Authorization:'Bearer '+s.accessToken}}});
 const r=await rootClient.rpc('contratacion_root_change_status',{p_company:j.operational.companyId,p_status:b.action==='activate'?'active':'inactive',p_reason:b.reason,p_evidence:evidence});if(r.error)throw Error('Root no pudo cambiar el estado. Revise sesión y requisitos.');
 }else{
 if(state.company?.status==='active')throw Error('Desactive primero; no cambie antecedentes de una cuenta activa.');
 if(b.revision!==state.flow.revision)throw Error('Otro cambio modificó esta solicitud. Actualice la vista.');
 const next=transition(state.flow.data,b.action,b,a.role);
 checked(await crm.rpc('qa_contract_save',{p_job:b.id,p_revision:b.revision,p_actor:a.id,p_action:b.action,p_data:next}));
 }
 json(await view(b.id,a));return;
 }
 throw Error('Ruta no disponible.');
 }catch(e){res.writeHead(400,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:e.message?.startsWith('fetch')?'No se pudo conectar a QA.':e.message||'La operación no se completó.'}));}
});
server.listen(port,'127.0.0.1',()=>console.log('Contratación QA: '+origin+(isolatedTransport?' · transporte simulado, sin servicios remotos.':' · bases reales de pruebas; pagos y correos simulados.')));






