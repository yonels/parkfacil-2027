'use client';
import {useState} from 'react';
import {authenticatedFetch} from '@/lib/supabaseBrowser';
// Pago exigible (SOL-2026-10-16-001): Root consulta la primera cuota en UF + IVA, ingresa la UF del Banco Central
// del día de envío del formulario y los datos de la transferencia; el CRM acepta hasta ±2 % y luego Root activa.
const clp=value=>Number(value).toLocaleString('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0});
// Acepta la UF como la publica el Banco Central (39.500,25) o con punto decimal (39500.25).
const ufInput=value=>{const t=String(value||'').trim();return t.includes(',')?t.replace(/\./g,'').replace(',','.'):t;};
const uf=value=>`${Number(value).toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:4})} UF`;
export default function PaymentVerification(){
 const [id,setId]=useState(''),[quote,setQuote]=useState(null),[payment,setPayment]=useState(null),[ufValue,setUfValue]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function call(body){
  setBusy(true);setMessage('');
  try{
   const response=await authenticatedFetch('/api/contratacion/root',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),result=await response.json();
   if(!response.ok||!result.ok){setMessage(result.mensaje||'No se pudo confirmar la acción.');return null;}
   return result.data;
  }catch{setMessage('Resultado no confirmado. Consulte el estado antes de reintentar.');return null;}finally{setBusy(false);}
 }
 async function consult(event){event.preventDefault();if(busy)return;setQuote(null);setPayment(null);const data=await call({action:'payment_quote',id:id.trim()});if(data)setQuote(data);}
 async function verify(event){event.preventDefault();if(busy||!quote)return;const v=Object.fromEntries(new FormData(event.currentTarget));
  const data=await call({action:'verify_payment',id:id.trim(),contractId:quote.contractId,ufValue:ufInput(v.ufValue),paidAmountClp:String(v.paidAmountClp||'').replace(/\D/g,''),
   reference:v.reference,transferDate:v.transferDate,note:v.note,confirmed:v.confirmed==='on'});
  if(data){setPayment(data);setMessage('Pago verificado y registrado en el CRM. Ya puede activar el servicio.');}
 }
 async function activate(event){event.preventDefault();if(busy||!payment)return;const v=Object.fromEntries(new FormData(event.currentTarget));
  const data=await call({action:'activate',id:id.trim(),contractId:payment.contractId,paymentId:payment.paymentId,reason:v.reason});
  if(data)setMessage('Servicio activado. Actualice el estado de la solicitud.');
 }
 const ufNumber=ufInput(ufValue),expected=quote&&/^\d{1,7}(\.\d{1,2})?$/.test(ufNumber)?Math.round(Number(quote.requiredAmount)*Number(ufNumber)):null;
 return <section className="space-y-4 rounded border bg-white p-5">
  <h2 className="text-xl font-bold">Verificar pago de la primera cuota y activar</h2>
  <p className="text-sm text-slate-600">La primera cuota es la primera mensualidad más los servicios de una sola vez, en UF + IVA. El cliente transfiere su equivalente en pesos con la UF del Banco Central del día en que envió el formulario. Se acepta una diferencia de hasta 2 %.</p>
  <form onSubmit={consult} className="flex flex-wrap items-end gap-3"><label className="grid flex-1 gap-1">Referencia de solicitud<input value={id} onChange={e=>setId(e.target.value)} required className="rounded border p-2" maxLength={80}/></label>
   <button disabled={busy} className="rounded bg-blue-700 px-4 py-2 text-white">Consultar primera cuota</button></form>
  {quote&&<dl className="grid gap-2 rounded bg-slate-50 p-4 sm:grid-cols-2">
   <div><dt className="text-sm text-slate-500">Primera mensualidad</dt><dd>{uf(quote.monthlyAmount)}</dd></div>
   <div><dt className="text-sm text-slate-500">Servicios únicos (implementación, capacitación)</dt><dd>{uf(quote.servicesAmount)}</dd></div>
   <div><dt className="text-sm text-slate-500">IVA</dt><dd>{quote.taxBasis==='included'?'Incluido en el contrato':uf(quote.taxAmount)}</dd></div>
   <div><dt className="text-sm text-slate-500">Total primera cuota</dt><dd className="font-bold">{uf(quote.requiredAmount)}</dd></div>
   <div className="sm:col-span-2"><dt className="text-sm text-slate-500">Fecha de la UF (envío del formulario)</dt><dd className="font-bold">{quote.ufDate}</dd></div>
  </dl>}
  {quote&&!payment&&<form onSubmit={verify} className="grid gap-4 sm:grid-cols-2">
   <label className="grid gap-1">Valor UF del {quote.ufDate} (Banco Central)<input name="ufValue" value={ufValue} onChange={e=>setUfValue(e.target.value)} required inputMode="decimal" placeholder="39.500,25" className="rounded border p-2"/></label>
   <div className="grid gap-1"><span>Monto esperado en pesos</span><span className="rounded bg-slate-50 p-2">{expected?`${clp(expected)} (aceptado: ${clp(Math.ceil(expected*0.98))} a ${clp(Math.floor(expected*1.02))})`:'Ingrese el valor UF'}</span></div>
   <label className="grid gap-1">Monto transferido (pesos)<input name="paidAmountClp" required inputMode="numeric" className="rounded border p-2"/></label>
   <label className="grid gap-1">Número de operación<input name="reference" required minLength={3} maxLength={80} className="rounded border p-2"/></label>
   <label className="grid gap-1">Fecha de la transferencia<input name="transferDate" type="date" required min={quote.ufDate} className="rounded border p-2"/></label>
   <label className="grid gap-1">Observación (opcional)<input name="note" maxLength={500} className="rounded border p-2"/></label>
   <label className="sm:col-span-2"><input type="checkbox" name="confirmed" required/> Verifiqué en la cuenta bancaria que la transferencia fue recibida.</label>
   <button disabled={busy} className="rounded bg-blue-700 p-3 text-white sm:col-span-2">{busy?'Procesando…':'Registrar pago verificado'}</button>
  </form>}
  {payment&&<div className="space-y-3"><p className="rounded bg-emerald-50 p-4">Pago registrado: {clp(payment.payment.paidAmountClp)} transferidos frente a {clp(payment.payment.expectedAmountClp)} esperados (diferencia {payment.payment.differencePct} %).</p>
   <form onSubmit={activate} className="grid gap-3"><label className="grid gap-1">Motivo de la activación<input name="reason" required minLength={8} maxLength={500} className="rounded border p-2"/></label>
    <button disabled={busy} className="rounded bg-emerald-700 p-3 text-white">{busy?'Procesando…':'Activar servicio'}</button></form></div>}
  {message&&<p role="status" className="rounded bg-slate-100 p-4">{message}</p>}
 </section>;
}
