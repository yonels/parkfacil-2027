'use client';
import {useState,useRef,useEffect} from 'react';
import {authenticatedFetch} from '@/lib/supabaseBrowser';
export default function EnrollmentManagement(){
 const [rows,setRows]=useState([]),[recoveries,setRecoveries]=useState([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[secret,setSecret]=useState(null),timer=useRef(null);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 async function send(event){event.preventDefault();if(busy)return;const form=event.currentTarget,values=Object.fromEntries(new FormData(form));setBusy(true);setMessage('');setSecret(null);
  try{
   const recovery=['issue','release','renew_pin'].includes(values.action),path=recovery?'/api/contratacion/recuperacion':'/api/contratacion/root';
   const body={...values,epoch:Number(values.epoch),revision:Number(values.revision),identityConfirmed:values.identityConfirmed==='on',excluded:values.excluded==='on'};
   const response=await authenticatedFetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),result=await response.json();
   if(!response.ok||!result.ok){setMessage(result.mensaje||'No se pudo confirmar la acción.');return;}
   if(values.action==='inspect')setRows(result.data?.jobs||[]);
   if(values.action==='recoveries')setRecoveries(result.data||[]);
   if(result.pin||result.url){setSecret(result.pin||result.url);clearTimeout(timer.current);timer.current=setTimeout(()=>setSecret(null),30000);}
   setMessage(result.mensaje||'Acción confirmada. Actualice el estado antes de continuar.');
  }catch{setMessage('Resultado no confirmado. Consulte el estado antes de reintentar una acción.');}finally{setBusy(false);}
 }
 const field=(name,label,type='text')=><label className="grid gap-1" key={name}>{label}<input name={name} type={type} className="rounded border p-2" maxLength={500}/></label>;
 return <main className="mx-auto max-w-5xl space-y-6 p-6"><h1 className="text-3xl font-bold">Contratación Off Street — Root</h1><p>El estado comercial de la empresa y la preparación operativa del estacionamiento son independientes. Recuperar un acceso no activa el servicio.</p>
 <form onSubmit={send} className="grid gap-4 rounded border bg-white p-5 sm:grid-cols-2"><label className="grid gap-1">Acción<select name="action" className="rounded border p-2">{[['inspect','Consultar solicitudes'],['recoveries','Consultar recuperaciones'],['resume','Retomar alta abandonada'],['adopt','Incorporar solicitud anterior revisada'],['review_link','Confirmar vínculo con empresa CRM'],['reconcile_mail','Conciliar correo'],['retry_mail','Reintentar correo confirmado no enviado'],['issue','Emitir enlace tras verificar identidad'],['release','Liberar recuperación abandonada'],['renew_pin','Renovar PIN inicial']].map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
 {field('id','Referencia de solicitud o recuperación')}{field('reason','Motivo y evidencia de la revisión')}{field('companyId','Empresa CRM confirmada (solo vinculación)')}{field('epoch','Versión del trabajo o correo consultado','number')}{field('userId','Usuario identificado (solo renovación PIN)')}
 <label className="grid gap-1">Tipo de correo<select name="kind" className="rounded border p-2"><option value="account_created">Cuenta creada</option><option value="credentials">Credenciales del representante</option></select></label>
 <label className="grid gap-1">Resultado comprobado del proveedor<select name="result" className="rounded border p-2"><option value="unknown">Desconocido — no reenviar</option><option value="sent">Enviado</option><option value="not_sent">Confirmado no enviado</option></select></label>{field('providerId','Referencia del proveedor si confirma envío')}
 <label><input type="checkbox" name="identityConfirmed"/> Verifiqué la identidad del representante o usuario solicitado.</label><label><input type="checkbox" name="excluded"/> Detuve el trabajador anterior y concilié sus llamadas externas pendientes.</label>
 <button disabled={busy} className="rounded bg-blue-700 p-3 text-white sm:col-span-2">{busy?'Procesando…':'Ejecutar acción seleccionada'}</button></form>
 {message&&<p role="status" className="rounded bg-slate-100 p-4">{message}</p>}{secret&&<div className="rounded border border-amber-400 bg-amber-50 p-4"><p>Entrega solo al representante verificado. Se ocultará en 30 segundos.</p><p className="break-all">{secret}</p><button onClick={()=>setSecret(null)} className="mt-3 underline">Ocultar ahora</button></div>}
 <section><h2 className="text-xl font-bold">Solicitudes consultadas</h2><div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>Referencia</th><th>Empresa</th><th>Estado del alta</th><th>Versión</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td className="p-2">{r.id}</td><td>{r.empresa}</td><td>{r.state}</td><td>{r.epoch}</td></tr>)}</tbody></table></div></section>
 <section><h2 className="text-xl font-bold">Recuperaciones consultadas</h2><ul>{recoveries.map(r=><li key={r.id} className="border-b py-2">{r.id} · {r.email} · {r.state} · emisiones: {r.issues}</li>)}</ul></section></main>;
}
