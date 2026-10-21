export function transition(state, action, body, role, now = new Date().toISOString()) {
 const s=structuredClone(state||{});
 if(['quote','verify','contract'].includes(action)&&role!=='root')throw Error('Solo Root puede realizar esta acción.');
 if(['accept','pay'].includes(action)&&role!=='client')throw Error('Ingrese como representante para esta acción.');
 if(action==='quote'){
  if(s.acceptedAt)throw Error('La cotización aceptada no puede reemplazarse.');
  const amount=Number(body.amount);
  if(!Number.isFinite(amount)||amount<=0||!['CLP','UF'].includes(body.currency)||!['first_month','full_contract'].includes(body.basis)||!String(body.reference||'').trim())throw Error('Revise monto, moneda, alcance y referencia.');
  return {quote:{amount,currency:body.currency,basis:body.basis,reference:body.reference.trim(),createdAt:now}};
 }
 if(action==='accept'){
  if(!s.quote)throw Error('Primero debe existir una cotización.');
  if(!s.acceptedAt)s.acceptedAt=now;
 }else if(action==='pay'){
  if(!s.acceptedAt||s.verifiedAt)throw Error('Se requiere aceptación y un pago aún no verificado.');
  const amount=Number(body.amount);
  if(!Number.isFinite(amount)||amount<=0||!String(body.reference||'').trim())throw Error('Indique monto y referencia de pago simulado.');
  s.payment={amount,reference:body.reference.trim(),currency:s.quote.currency,simulated:true,createdAt:now};
 }else if(action==='verify'){
  if(!s.payment||s.payment.amount<s.quote.amount)throw Error('El pago simulado debe cubrir el monto exigido.');
  s.verifiedAt=now;
 }else if(action==='contract'){
  if(!s.acceptedAt||!String(body.reference||'').trim())throw Error('Se requiere cotización aceptada y referencia contractual de prueba.');
  s.contract={reference:body.reference.trim(),completedAt:now,simulated:true};
 }else throw Error('Acción desconocida.');
 return s;
}
export function activationEvidence(s){
 if(!s?.quote||!s.acceptedAt||!s.verifiedAt||!s.contract||!s.payment)throw Error('Faltan aceptación, contrato o pago verificado.');
 return {quoteReference:s.quote.reference,contractReference:s.contract.reference,paymentReference:s.payment.reference,quoteAccepted:true,contractCompleted:true,paymentVerified:true,basis:s.quote.basis,currency:s.quote.currency,requiredAmount:s.quote.amount,paidAmount:s.payment.amount,simulation:true};
}
