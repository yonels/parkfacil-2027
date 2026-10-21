'use strict';
// A green button records a click; operation results remain in status messages.
const clickedButtonStyle=document.createElement('style');
clickedButtonStyle.textContent='button[data-qa-clicked],input[data-qa-clicked][type="submit"],input[data-qa-clicked][type="button"],input[data-qa-clicked][type="reset"]{background:#24633d!important;background-color:#24633d!important;color:#fff!important;border-color:#24633d!important}';
document.head.append(clickedButtonStyle);
document.addEventListener('click',event=>{
 const button=event.target instanceof Element?event.target.closest('button,input[type="submit"],input[type="button"],input[type="reset"]'):null;
 if(button&&!button.disabled)button.setAttribute('data-qa-clicked','true');
},true);

const $=id=>document.getElementById(id);let csrf='',actor=null,current=null,secretTimer;const management=location.pathname==='/gestion';
const docs=[{id:'condiciones-del-servicio',version:'0.2',sha256:'54f9649f364b17c1de4bddf9efb6c7ad8de8a4206ff6ef11aa45b2ef988f8df5'},{id:'declaracion-confidencialidad-datos-personales',version:'0.4',sha256:'32b45cd2eae971ed1035cf2b3d1f5f2588565f9d4a0b555f6868b5bddbcfeb2a'}];
let requestId=localStorage.getItem('pfqa-enrollment-id')||crypto.randomUUID();localStorage.setItem('pfqa-enrollment-id',requestId);
function message(s){$('message').textContent=s;}
async function api(path,body){const r=await fetch(path,body===undefined?{signal:AbortSignal.timeout(20000)}:{method:'POST',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json','X-QA-CSRF':csrf},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error||'Error QA');return d;}
function copyButton(value,label){
 const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-live','polite');b.style.cssText='display:block;font-size:14px;padding:6px;margin-top:8px';
 b.onclick=async()=>{
  b.disabled=true;b.textContent='Copiando…';
  try{
   if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');
   await navigator.clipboard.writeText(value);b.textContent='Copiado ✓';b.style.background='#24633d';b.title='Texto completo copiado. Péguelo con Ctrl+V.';
  }catch{b.textContent='No se pudo copiar';b.style.background='#a12828';b.title='Seleccione el texto completo y use Ctrl+C.';}
  b.disabled=false;
 };
 return b;
}
let secretRevision=0;
function clearSecrets(){secretRevision++;clearTimeout(secretTimer);$('secrets').textContent='';document.querySelectorAll('[data-password-user]').forEach(x=>x.textContent='Oculta');}
async function session(){const s=await api('/api/session');csrf=s.csrf;actor=s.actor;if(s.temporaryPinEnabled){$('credential-mode').textContent='Las cuentas nuevas usan claves temporales de cuatro dígitos y requieren cambio a una clave personal. Las cuentas anteriores conservan su mecanismo de acceso. La activación controla la empresa operacional.';accountNote.textContent='Puede modificar sus accesos y los de sus operadores activos. Las cuentas nuevas deben cambiar primero su clave temporal.';}$('identity').textContent=actor?`${actor.role==='root'?'Root':'Representante'} · ${actor.email}`:'Sin sesión';$('login').hidden=!!actor;$('logout').hidden=!actor;$('dashboard').hidden=!actor||!management||actor.mustChangePassword||actor.accountRole==='operator';
 temporaryPanel.hidden=!actor?.mustChangePassword;
 credentialsPanel.hidden=!(actor?.role==='root'||(actor?.accountRole==='company_admin'&&actor?.scope==='operational'&&!actor?.mustChangePassword));
 document.querySelectorAll('.rootOnly').forEach(x=>x.hidden=actor?.role!=='root');document.querySelectorAll('.clientOnly').forEach(x=>x.hidden=actor?.role!=='client');if(actor&&management&&!actor.mustChangePassword&&actor.accountRole!=='operator')await jobs();if(actor?.accountRole==='operator'&&!actor.mustChangePassword)message('Cuenta de operador: la gestión web está restringida al administrador.');}
async function jobs(){const list=await api('/api/jobs');const previous=$('jobs').value;$('jobs').replaceChildren();for(const j of list){const o=document.createElement('option');o.value=j.id;o.textContent=`${j.empresa} · ${j.state}`;$('jobs').append(o);}if(list.some(x=>x.id===previous))$('jobs').value=previous;if(list.length)await load();else $('details').hidden=true;}
async function load(){clearSecrets();const id=$('jobs').value;if(!id)throw Error('No hay una solicitud seleccionada para actualizar.');render(await api('/api/view?id='+encodeURIComponent(id)));}
function render(v){clearSecrets();current=v;updateActionButtons(v);$('details').hidden=false;$('company').textContent=v.company?.business_name||'Alta pendiente';$('status').textContent=`Empresa operacional: ${v.company?.status||'pendiente'} · Solicitud: ${v.state}`+(actor?.role==='client'?` · Acceso operativo según estado BD: ${v.operationalAllowed?'habilitado; falta validar portal/POS':'bloqueado'}`:'');
 $('members').replaceChildren();for(const m of v.members){const row=document.createElement('tr');for(const [i,text] of [m.role,m.email,'Oculta',m.status].entries()){const td=document.createElement('td');td.textContent=text;if(i===2)td.dataset.passwordUser=m.email;if(i===1)td.append(copyButton(m.email,'Copiar usuario'));row.append(td)}const actions=document.createElement('td');if(actor?.role==='client'&&actor.accountRole==='company_admin'&&v.company?.status==='active'){
 const action=document.createElement('button');action.type='button';action.textContent=m.role==='company_admin'?'Cambiar mi clave':'Restablecer clave';action.onclick=()=>{accountFields.target.value=m.user_id;accountFields.target.onchange();accountFields.password.required=true;accountFields.confirm.required=true;accountTitle.textContent=action.textContent;accountStatus.textContent='Confirme su clave actual de administrador e ingrese la nueva clave dos veces.';accountPanel.scrollIntoView({behavior:'smooth'});accountFields.current.focus();};actions.append(action);
 }row.append(actions);$('members').append(row);}
 renderAccountEditor(v);
 const f=v.flow.data;
 $('flow').textContent=f.quote?[
 'Cotización: '+f.quote.reference+' · '+f.quote.amount+' '+f.quote.currency,
 'Pago exigido: '+(f.quote.basis==='first_month'?'Primera mensualidad':'Contrato completo'),
 'Aceptación: '+(f.acceptedAt?'Registrada':'Pendiente del representante'),
 'Pago simulado: '+(f.payment?f.payment.amount+' '+f.payment.currency+' · '+f.payment.reference:'Pendiente'),
 'Verificación Root: '+(f.verifiedAt?'Registrada':'Pendiente'),
 'Contrato de prueba: '+(f.contract?f.contract.reference:'Pendiente')].join('\n'):'Sin cotización registrada.';
 const labels={quote:'Cotización registrada',accept:'Cotización aceptada',pay:'Pago simulado registrado',verify:'Pago verificado por Root',contract:'Contrato de prueba registrado'};
 $('events').textContent=v.events.length?v.events.map(e=>(labels[e.action]||e.action)+' · '+new Date(e.created_at).toLocaleString('es-CL')).join('\n'):'Sin eventos comerciales registrados.';$('mail').textContent=`Para: ${v.companyEmail}\nAsunto: ${v.mail.subject}\n\n${v.mail.body}`;
 if(v.flow.data.quote){$('amount').value=v.flow.data.quote.amount;$('currency').value=v.flow.data.quote.currency;$('basis').value=v.flow.data.quote.basis;}
}
$('login').onsubmit=async e=>{e.preventDefault();message('');try{await api('/api/login',{email:$('email').value,password:$('password').value});$('password').value='';await session();message('Sesión QA iniciada.');}catch(e){$('password').value='';message(e.message)}};
$('logout').onclick=async()=>{clearSecrets();await api('/api/logout',{});current=null;$('members').replaceChildren();$('flow').textContent='';$('events').textContent='';await session();};
const reloadStatus=document.createElement('p');reloadStatus.id='reload-status';reloadStatus.setAttribute('role','status');reloadStatus.setAttribute('aria-live','polite');reloadStatus.style.cssText='padding:12px;border-radius:8px;font-weight:600';$('reload').insertAdjacentElement('afterend',reloadStatus);
let reloading=false;
async function refreshDetails(){
 clearSecrets();
 if(reloading)return;
 reloading=true;const button=$('reload'),select=$('jobs');button.disabled=true;select.disabled=true;button.textContent='Actualizando…';button.style.background='#6f5a14';button.setAttribute('aria-busy','true');reloadStatus.style.background='#fff4cf';reloadStatus.textContent='Consultando los datos guardados en QA…';message('');
 try{
  await load();button.textContent='✓ Datos actualizados';button.style.background='#24633d';reloadStatus.style.background='#eaf6ef';reloadStatus.textContent='✓ Datos actualizados correctamente desde QA a las '+new Date().toLocaleTimeString('es-CL')+'.';
 }catch(e){
  button.textContent='Reintentar actualización';button.style.background='#a12828';reloadStatus.style.background='#fff0f0';reloadStatus.textContent='No se pudo confirmar la actualización. '+(e.name==='TimeoutError'?'QA no respondió dentro de 20 segundos.':e.message==='Failed to fetch'?'No se pudo conectar con el servidor. Compruebe que npm run web siga abierto.':e.message)+' Los datos visibles pueden corresponder a la consulta anterior.';
 }finally{reloading=false;button.disabled=false;select.disabled=false;button.setAttribute('aria-busy','false');}
}
$('reload').onclick=refreshDetails;$('jobs').onchange=refreshDetails;
const credentialsPanel=document.createElement('div');credentialsPanel.hidden=true;$('members').closest('table').insertAdjacentElement('afterend',credentialsPanel);
 credentialsPanel.append($('credentials'),$('secrets'));
const credentialsStatus=document.createElement('p');credentialsStatus.id='credentials-status';credentialsStatus.setAttribute('role','status');credentialsStatus.style.cssText='padding:10px 0;white-space:pre-wrap;font-weight:600';$('credentials').insertAdjacentElement('afterend',credentialsStatus);
$('credentials').onclick=async()=>{
 const button=$('credentials');button.disabled=true;button.textContent='Consultando claves…';clearSecrets();credentialsStatus.textContent='Consultando las claves temporales en QA…';
 try{
  if(!current?.id)throw Error('Seleccione una solicitud y pulse Actualizar datos.');
  const revision=secretRevision,jobId=current.id;
  const rows=await api('/api/credentials',{id:jobId});
  if(revision!==secretRevision||document.hidden||!document.hasFocus()||current?.id!==jobId)return;
  if(!Array.isArray(rows))throw Error('Respuesta de claves no válida.');
  let shown=0;
  for(const cell of document.querySelectorAll('[data-password-user]')){
   const value=rows.find(x=>x.user===cell.dataset.passwordUser)?.password;cell.textContent=value||'No disponible';if(value){cell.append(copyButton(value,'Copiar clave'));shown++;}
  }
  if(!shown)throw Error('No hay PIN temporales vigentes disponibles para consultar en estas cuentas.');
  credentialsStatus.textContent='PIN temporales vigentes mostrados. Use Copiar clave en la cuenta correspondiente. Se ocultan a los 30 segundos o al salir de esta ventana.';
  $('secrets').textContent='';secretTimer=setTimeout(()=>{clearSecrets();credentialsStatus.textContent='Claves ocultas al cumplirse los 30 segundos. Puede consultarlas nuevamente.';},30000);
 }catch(e){credentialsStatus.textContent='No se pudieron mostrar las claves: '+(e.name==='TimeoutError'?'QA no respondió dentro de 20 segundos.':e.message);}
 finally{button.disabled=false;button.textContent='Consultar y mostrar claves temporales';}
};
window.addEventListener('blur',clearSecrets);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearSecrets()});

const actionHeader=document.createElement('th');actionHeader.textContent='Acciones';$('members').closest('table').querySelector('thead tr').append(actionHeader);
const accountPanel=document.createElement('section');accountPanel.id='account-editor';accountPanel.hidden=true;$('details').append(accountPanel);
const accountTitle=document.createElement('h3');accountTitle.textContent='Mi cuenta y operadores · QA';accountPanel.append(accountTitle);
const accountNote=document.createElement('p');accountNote.textContent='Puede cambiar el correo de acceso y la clave sin crear otra cuenta. El correo comercial se conserva. En QA use @example.invalid; las claves de cuatro dígitos siguen pendientes.';accountPanel.append(accountNote);
const accountForm=document.createElement('form');accountPanel.append(accountForm);
const accountFields={};
for(const [id,label,type] of [['target','Cuenta a modificar','select'],['email','Nuevo usuario (correo de prueba)','email'],['current','Su clave actual de administrador','password'],['password','Nueva clave (opcional; mínimo 8 caracteres)','password'],['confirm','Confirmar nueva clave','password']]){
 const wrapper=document.createElement('label');wrapper.textContent=label;const field=document.createElement(type==='select'?'select':'input');if(type!=='select')field.type=type;field.autocomplete=type==='password'?(id==='current'?'current-password':'new-password'):'off';field.required=['email','current'].includes(id);accountFields[id]=field;wrapper.append(field);accountForm.append(wrapper);
}
const saveAccount=document.createElement('button');saveAccount.type='submit';saveAccount.textContent='Guardar cambios de acceso';accountForm.append(saveAccount);
const accountStatus=document.createElement('p');accountStatus.setAttribute('role','status');accountForm.append(accountStatus);
function clearAccountPasswords(){for(const id of ['current','password','confirm'])accountFields[id].value='';}
function renderAccountEditor(v){
 accountPanel.hidden=actor?.role!=='client'||v.company?.status!=='active';clearAccountPasswords();accountFields.target.replaceChildren();
 for(const m of v.members){const option=document.createElement('option');option.value=m.user_id;option.textContent=(m.role==='company_admin'?'Administrador':'Operador')+' · '+m.email;option.dataset.email=m.email;accountFields.target.append(option);}
 accountFields.email.value=accountFields.target.selectedOptions[0]?.dataset.email||'';
}
accountFields.target.onchange=()=>{clearAccountPasswords();accountFields.email.value=accountFields.target.selectedOptions[0]?.dataset.email||'';accountStatus.textContent='';saveAccount.textContent='Guardar cambios de acceso';saveAccount.style.background='';};
accountForm.onsubmit=async e=>{
 e.preventDefault();if(saveAccount.disabled)return;saveAccount.disabled=true;saveAccount.textContent='Guardando…';saveAccount.style.background='#6f5a14';accountStatus.textContent='Verificando permisos y guardando el cambio en QA…';
 try{
 const result=await api('/api/account',{id:current.id,targetId:accountFields.target.value,email:accountFields.email.value,currentPassword:accountFields.current.value,password:accountFields.password.value,confirmPassword:accountFields.confirm.value});
 clearAccountPasswords();saveAccount.textContent='✓ Acceso actualizado';saveAccount.style.background='#24633d';accountStatus.textContent='✓ Acceso actualizado en QA. La cuenta conserva su identificador e historial. La clave nueva no se vuelve a mostrar.';
 if(result.pendingState)accountStatus.textContent+=' La clave se guardó; queda pendiente revisar el estado de la cuenta.';
 if(result.self){await session();message('✓ Acceso actualizado. Ingrese nuevamente con su nuevo usuario y clave.');}else await load();
 }catch(e){accountStatus.textContent='No se pudo confirmar el cambio: '+e.message;saveAccount.textContent='Reintentar cambio';saveAccount.style.background='#a12828';}
 finally{clearAccountPasswords();saveAccount.disabled=false;}
};
window.addEventListener('blur',clearAccountPasswords);

const completedLabels={quote:'Cotización registrada',accept:'Aceptación registrada',pay:'Pago simulado registrado',verify:'Pago verificado',contract:'Contrato registrado',activate:'Empresa y cuentas activadas',deactivate:'Empresa y cuentas desactivadas'};
function updateActionButtons(v){
 const f=v.flow.data;
 const done={quote:!!f.quote,accept:!!f.acceptedAt,pay:!!f.payment,verify:!!f.verifiedAt,contract:!!f.contract,activate:v.company?.status==='active',deactivate:v.company?.status==='inactive'};
 const locked={quote:!!f.acceptedAt,accept:!!f.acceptedAt,pay:!!f.verifiedAt,verify:!!f.verifiedAt,contract:!!f.contract,activate:v.company?.status==='active',deactivate:v.company?.status==='inactive'};
 for(const b of document.querySelectorAll('[data-action]')){
  if(!b.dataset.originalLabel)b.dataset.originalLabel=b.textContent;
  b.textContent=done[b.dataset.action]?'✓ '+completedLabels[b.dataset.action]:b.dataset.originalLabel;
  b.style.background=done[b.dataset.action]?'#24633d':'';b.disabled=!!locked[b.dataset.action];
 }
}
for(const b of document.querySelectorAll('[data-action]'))b.onclick=async()=>{
 if(b.disabled)return;
 let status=b.parentElement.querySelector('.action-status');if(!status){status=document.createElement('p');status.className='action-status';status.setAttribute('role','status');status.tabIndex=-1;status.style.cssText='padding:14px;border-radius:8px;white-space:pre-wrap';b.parentElement.append(status);}
 b.disabled=true;b.textContent='Procesando…';b.style.background='#6f5a14';clearSecrets();status.style.background='#fff4cf';status.textContent='Procesando la acción. Espere la confirmación…';message('');
 try{
  const updated=await api('/api/action',{id:current.id,revision:current.flow.revision,action:b.dataset.action,amount:Number($('amount').value),currency:$('currency').value,basis:$('basis').value,reference:$('reference').value,reason:$('reason').value});
  render(updated);status.style.background='#eaf6ef';status.textContent='✓ '+completedLabels[b.dataset.action]+'. Cambio guardado correctamente en QA.';
 }catch(e){updateActionButtons(current);status.style.background='#fff0f0';status.textContent='No se pudo confirmar la acción: '+e.message;}
 status.focus();status.scrollIntoView({block:'center',behavior:'smooth'});
};
function rutDV(body){let sum=0,m=2;for(const c of String(body).split('').reverse()){sum+=Number(c)*m;m=m===7?2:m+1;}const n=11-sum%11;return n===11?'0':n===10?'K':String(n);}
function validRut(value){const s=String(value).replace(/[^0-9kK]/g,'').toUpperCase();return s.length>1&&/^\d+$/.test(s.slice(0,-1))&&Number(s.slice(0,-1))>0&&rutDV(s.slice(0,-1))===s.slice(-1);}
const form=$('enrollment');
function errorFor(el){if(el.type==='hidden')return '';if(el.id==='doc0'||el.id==='doc1')return el.disabled?'Abra primero el PDF.':!el.checked?'Confirme la declaración.':'';if(el.required&&!el.value.trim())return 'Complete este campo.';if(['rut','representanteRut'].includes(el.name)&&!validRut(el.value))return 'Revise el RUT y su dígito verificador.';if(el.name==='plazas'&&(!Number.isSafeInteger(Number(el.value))||Number(el.value)<50))return 'Ingrese al menos 50 plazas, sin decimales.';return el.validity.valid?'':'Revise el valor ingresado.';}
function mark(el,error){el.setAttribute('aria-invalid',error?'true':'false');let node=el.parentElement.querySelector('.error');if(!node){node=document.createElement('span');node.className='error';el.parentElement.append(node);}node.textContent=error;}
for(const el of form.querySelectorAll('input,select'))for(const event of ['input','change'])el.addEventListener(event,()=>{if(el.getAttribute('aria-invalid')==='true')mark(el,errorFor(el));});
for(const link of document.querySelectorAll('[data-doc]'))link.onclick=()=>{$('doc'+link.dataset.doc).disabled=false;};
const submitButton=form.querySelector('[type=submit]');
let sending=false,completed=false;
const confirmation=document.createElement('div');confirmation.id='enrollment-confirmation';confirmation.setAttribute('role','status');confirmation.tabIndex=-1;confirmation.hidden=true;confirmation.style.cssText='padding:18px;margin:14px 0;border-radius:8px;background:#eaf6ef;color:#174e30;white-space:pre-wrap';submitButton.insertAdjacentElement('afterend',confirmation);
function enrollmentNotice(text,success=false){confirmation.hidden=false;confirmation.textContent=text;confirmation.style.background=success?'#eaf6ef':'#eef2f7';confirmation.style.color=success?'#174e30':'#16233b';confirmation.focus();confirmation.scrollIntoView({block:'center',behavior:'smooth'});}
form.onsubmit=async e=>{
 e.preventDefault();if(sending||completed)return;message('');confirmation.hidden=true;
 for(const el of form.querySelectorAll('input,select')){const error=errorFor(el);if(error){mark(el,error);const target=el.disabled?document.querySelector(`[data-doc="${el.id==='doc0'?0:1}"]`):el;target.focus();target.scrollIntoView({block:'center',behavior:'smooth'});message(error);return;}}
 sending=true;submitButton.disabled=true;submitButton.textContent='Enviando solicitud…';form.setAttribute('aria-busy','true');
 try{
  const out=await api('/api/enroll',{...Object.fromEntries(new FormData(form)),requestId,aceptaCondiciones:$('doc0').checked,lecturaPrivacidad:$('doc1').checked,documentos:docs});
  if(out.estado==='creada'){
   completed=true;submitButton.textContent='Solicitud enviada';
   for(const el of form.querySelectorAll('input,select'))el.disabled=true;
   enrollmentNotice('Su solicitud fue enviada.\nProceso terminado. Su cuenta y accesos permanecen inactivos hasta completar los requisitos de contratación.\nReferencia: '+out.referencia,true);
  }else{
   submitButton.textContent='Comprobar solicitud';
   enrollmentNotice('Su solicitud está siendo procesada. Aún no se ha confirmado su finalización. Conserve este intento y vuelva a comprobar su estado.');
  }
 }catch(e){submitButton.textContent='Reintentar envío';enrollmentNotice('No se pudo confirmar el envío. '+e.message+' Conserve los datos y este mismo intento para reintentar.');}
 finally{sending=false;form.setAttribute('aria-busy','false');submitButton.disabled=completed;}
};
$('example').onclick=()=>{if(!confirm('¿Preparar una solicitud ficticia NUEVA? No use esta opción para recuperar un intento fallido.'))return;if(sending)return;completed=false;confirmation.hidden=true;submitButton.disabled=false;submitButton.textContent='Crear solicitud en QA';for(const el of form.querySelectorAll('input,select'))el.disabled=false;requestId=crypto.randomUUID();localStorage.setItem('pfqa-enrollment-id',requestId);for(const input of form.querySelectorAll('input[name]')){input.value=input.name.toLowerCase().includes('correo')?`prueba-${requestId}@example.invalid`:input.name.toLowerCase().includes('telefono')?'+56900000000':'Dato ficticio';mark(input,'');}const body=10000000+Math.floor(Math.random()*80000000);form.elements.rut.value=`${body}-${rutDV(body)}`;form.elements.representanteRut.value='12.345.678-5';form.elements.empresa.value='EMPRESA QA '+requestId.slice(0,8);form.elements.representanteNombres.value='Ana';form.elements.representanteApellidos.value='Prueba';form.elements.plazas.value='50';form.elements.tipoServicio.value='OFF_STREET';for(let i=0;i<2;i++){$('doc'+i).checked=false;$('doc'+i).disabled=true;}message('Ejemplo nuevo: revise los datos y abra ambos PDF.');};
const forgotButton=document.createElement('button');forgotButton.type='button';forgotButton.textContent='Olvidé mi clave';$('login').append(forgotButton);
 const recoveryPanel=document.createElement('section');recoveryPanel.hidden=true;$('access').append(recoveryPanel);
 const recoveryHeading=document.createElement('h3');recoveryHeading.textContent='Recuperar acceso · QA';recoveryPanel.append(recoveryHeading);
 const recoveryNote=document.createElement('p');recoveryNote.textContent='QA no envía correos. Root verifica su identidad y entrega un enlace de un solo uso, válido 15 minutos. Las solicitudes se conservan una hora en este servidor y se pierden al reiniciarlo.';recoveryPanel.append(recoveryNote);
 const recoveryForm=document.createElement('form');recoveryPanel.append(recoveryForm);
 const recoveryEmail=document.createElement('input');recoveryEmail.type='email';recoveryEmail.required=true;recoveryEmail.placeholder='Su correo de administrador';recoveryEmail.setAttribute('aria-label','Correo de recuperación');recoveryForm.append(recoveryEmail);
 let recoveryToken=new URLSearchParams(location.hash.slice(1)).get('recuperar')||'';if(recoveryToken){history.replaceState(null,'',location.pathname);recoveryPanel.hidden=false;recoveryEmail.hidden=true;recoveryEmail.required=false;}
 const resetFields=[];for(const label of ['Nueva clave personal','Confirme la nueva clave']){const wrapper=document.createElement('label');wrapper.textContent=label;const input=document.createElement('input');input.type='password';input.autocomplete='new-password';input.minLength=8;input.maxLength=128;input.required=!!recoveryToken;wrapper.hidden=!recoveryToken;wrapper.append(input);recoveryForm.append(wrapper);resetFields.push(input);}
 const recoverySubmit=document.createElement('button');recoverySubmit.textContent=recoveryToken?'Guardar nueva clave':'Solicitar recuperación a Root';recoveryForm.append(recoverySubmit);
 const recoveryStatus=document.createElement('p');recoveryStatus.setAttribute('role','status');recoveryPanel.append(recoveryStatus);
 forgotButton.onclick=()=>{recoveryPanel.hidden=false;recoveryEmail.value=$('email').value;recoveryPanel.scrollIntoView();recoveryEmail.focus();};
 recoveryForm.onsubmit=async e=>{e.preventDefault();recoverySubmit.disabled=true;try{if(recoveryToken){await api('/api/recovery-complete',{token:recoveryToken,password:resetFields[0].value,confirmPassword:resetFields[1].value});recoveryToken='';recoveryStatus.textContent='Clave guardada correctamente. Ingrese con su nueva clave.';recoverySubmit.hidden=true;}else{await api('/api/forgot-password',{email:recoveryEmail.value});recoveryStatus.textContent='Solicitud recibida. Si la cuenta corresponde, Root podrá ayudarle tras verificar su identidad. No se ha enviado correo.';}}catch(e){recoveryStatus.textContent=e.message;}finally{resetFields.forEach(f=>f.value='');recoverySubmit.disabled=false;}};
 const rootRecovery=document.createElement('section');rootRecovery.className='rootOnly';rootRecovery.hidden=true;$('access').append(rootRecovery);
 const rootRecoveryButton=document.createElement('button');rootRecoveryButton.textContent='Revisar solicitudes de recuperación';rootRecovery.append(rootRecoveryButton);
 const rootRecoveryList=document.createElement('div');rootRecovery.append(rootRecoveryList);window.addEventListener('blur',()=>rootRecoveryList.replaceChildren());document.addEventListener('visibilitychange',()=>{if(document.hidden)rootRecoveryList.replaceChildren();});
 rootRecoveryButton.onclick=async()=>{try{const rows=await api('/api/recovery-requests');rootRecoveryList.replaceChildren();if(!rows.length)rootRecoveryList.textContent='No hay solicitudes pendientes.';for(const r of rows){const p=document.createElement('p');p.textContent=r.email+' · '+r.state;const issue=document.createElement('button');issue.textContent='Generar enlace tras verificar identidad';issue.disabled=r.state!=='pending';issue.onclick=async()=>{if(!confirm('¿Verificó la identidad de este administrador por un canal confiable? El enlace permitirá cambiar su clave.'))return;try{const result=await api('/api/recovery-issue',{id:r.id,identityConfirmed:true});p.textContent='Enlace de un solo uso · 15 minutos';p.append(copyButton(result.url,'Copiar enlace de recuperación'));issue.disabled=true;}catch(e){message(e.message);}};p.append(issue);rootRecoveryList.append(p);}}catch(e){message(e.message);}};
const temporaryPanel=document.createElement('section');temporaryPanel.hidden=true;$('login').insertAdjacentElement('afterend',temporaryPanel);
const temporaryTitle=document.createElement('h3');temporaryTitle.textContent='Cambie su clave temporal';temporaryPanel.append(temporaryTitle);
const temporaryForm=document.createElement('form');temporaryPanel.append(temporaryForm);
const temporaryFields={};
for(const [name,label] of [['currentPin','Clave temporal de cuatro dígitos'],['password','Nueva clave personal (mínimo 8 caracteres)'],['confirmPassword','Confirme su nueva clave']]){
 const wrapper=document.createElement('label');wrapper.textContent=label;
 const field=document.createElement('input');field.type='password';field.required=true;field.autocomplete=name==='currentPin'?'current-password':'new-password';
 if(name==='currentPin'){field.inputMode='numeric';field.pattern='[0-9]{4}';field.maxLength=4;}else{field.minLength=8;field.maxLength=128;}
 temporaryFields[name]=field;wrapper.append(field);temporaryForm.append(wrapper);
}
const temporarySubmit=document.createElement('button');temporarySubmit.type='submit';temporarySubmit.textContent='Guardar mi clave personal';temporaryForm.append(temporarySubmit);
const clearTemporaryFields=()=>Object.values(temporaryFields).forEach(field=>field.value='');
window.addEventListener('blur',clearTemporaryFields);
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTemporaryFields();});
temporaryForm.onsubmit=async event=>{
 event.preventDefault();temporarySubmit.disabled=true;
 try{const saved=await api('/api/temporary-password',Object.fromEntries(Object.entries(temporaryFields).map(([key,field])=>[key,field.value])));clearTemporaryFields();await session();message(saved.pendingState?'Clave personal guardada. Ingrese nuevamente; queda pendiente revisar el estado de la cuenta.':'Clave personal guardada. Ingrese nuevamente; la clave temporal dejó de ser válida.');}
 catch(error){clearTemporaryFields();message(error.message);}
 finally{temporarySubmit.disabled=false;}
};
session().catch(e=>message(e.message));




