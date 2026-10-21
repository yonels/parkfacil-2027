import test from 'node:test';import assert from 'node:assert/strict';import {resolveAuthenticatedContext} from './contextCore.mjs';
for(const role of ['company_admin','operator'])for(const portal of ['client','terminal']){
 test(`${role} en ${portal}: miembro inactivo bloqueado`,async()=>{await assert.rejects(()=>resolveAuthenticatedContext({user:{id:'qa',app_metadata:{role:'pending_enrollment'}},portal,loadMembership:async()=>({status:'inactive',role,company_id:'qa'})}),e=>e.code==='MEMBERSHIP_INACTIVE');});
 test(`${role} en ${portal}: empresa inactiva bloqueada`,async()=>{await assert.rejects(()=>resolveAuthenticatedContext({user:{id:'qa',app_metadata:{role}},portal,loadMembership:async()=>({status:'active',role,company_id:'qa',company:{status:'inactive',relationship_type:'client'}})}),e=>e.code==='COMPANY_INACTIVE');});
}
test('Metadata editable del usuario no concede Root',async()=>{await assert.rejects(()=>resolveAuthenticatedContext({user:{id:'qa',user_metadata:{role:'platform_admin'}},portal:'root',loadMembership:async()=>null}),e=>e.code==='MEMBERSHIP_INACTIVE');});
