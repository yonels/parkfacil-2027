import {randomBytes,randomUUID,createHash} from 'node:crypto';
const digest=x=>createHash('sha256').update(x).digest('hex');
export function recoveryQueue({now=Date.now}={}){
 const requests=new Map(),tickets=new Map();
 function prune(){for(const [id,r] of requests)if(now()-r.created>3600000)requests.delete(id);for(const [key,t] of tickets)if(t.expires<=now())tickets.delete(key);}
 return {
 request(email){prune();email=String(email||'').trim().toLowerCase();if(email.length>254||!email.includes('@'))return;if([...requests.values()].some(r=>r.email===email)||requests.size>=100)return;requests.set(randomUUID(),{email,created:now(),state:'pending'});},
 list(){prune();return [...requests].map(([id,r])=>({id,...r}));},
 async issue(id,lookup){prune();const r=requests.get(id);if(!r||r.state!=='pending')throw Error('Solicitud no disponible.');r.state='checking';try{const user=await lookup(r.email);if(!user)throw Error('Cuenta no recuperable en este QA.');const token=randomBytes(32).toString('base64url');tickets.set(digest(token),{user,expires:now()+900000,busy:false});r.state='issued';return token;}catch(e){r.state='pending';throw e;}},
 async complete(token,password,save){prune();const key=digest(String(token||'')),t=tickets.get(key);if(!t||t.busy||password.length<8||password.length>128)throw Error('Enlace no válido o clave fuera de los límites de 8 a 128 caracteres.');t.busy=true;try{await save(t.user,password);tickets.delete(key);}catch(e){t.busy=false;throw e;}}
 };
}
