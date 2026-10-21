export function accessScope(state,{allowCommercial=false}={}){
 if(!state||!['company_admin','operator'].includes(state.role))throw Error('No se pudo autorizar el acceso.');
 if(state.companyStatus==='active'&&state.memberStatus==='active')return 'operational';
 if(allowCommercial&&state.role==='company_admin'&&state.companyStatus==='inactive'&&state.memberStatus==='inactive'&&state.everActivated===false)return 'commercial';
 throw Error('No se pudo autorizar el acceso.');
}
export function requireOperational(actor){
 if(actor.role!=='client'||actor.scope!=='operational'||actor.mustChangePassword||actor.accountRole!=='company_admin')throw Error('Acceso operativo no autorizado.');
 return actor.companyId;
}
