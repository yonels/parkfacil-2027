// Identity and authorization use immutable IDs, never contact email or user_metadata.
export function authorizeAccountEdit({actorId,company,members,targetId}){
 const admin=members.find(m=>m.user_id===actorId);
 const target=members.find(m=>m.user_id===targetId);
 if(company?.status!=='active'||admin?.status!=='active'||admin?.role!=='company_admin')throw Error('Solo el administrador activo de esta empresa puede modificar accesos.');
 if(!target||!['company_admin','operator'].includes(target.role)||(target.role==='company_admin'&&target.user_id!==actorId))throw Error('Solo puede modificar su cuenta y los operadores de su empresa.');
 return target;
}
export function accountInput(b){
 const email=String(b.email||'').trim().toLowerCase(),password=String(b.password||'');
 if(email.length>254||! /^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@example\.invalid$/.test(email))throw Error('En este QA use un correo de prueba terminado en @example.invalid.');
 if(password&& (password.length<8||password.length>128))throw Error('La nueva clave debe tener entre 8 y 128 caracteres en este QA.');
 if(password!==String(b.confirmPassword||''))throw Error('La confirmación de la nueva clave no coincide.');
 if(!b.currentPassword||String(b.currentPassword).length>256)throw Error('Ingrese su clave actual de administrador.');
 return {email,password};
}
export async function updateAccount({admin,actorId,company,members,targetId,input,reauthenticate}){
 authorizeAccountEdit({actorId,company,members,targetId});if(!await reauthenticate(String(input.currentPassword)))throw Error('No se pudo confirmar su clave actual de administrador.');
 const beforeInput=await admin.getUserById(targetId);
 const preservingEmail=beforeInput.data?.user?.email===String(input.email||'').trim().toLowerCase();
 const values=accountInput({...input,email:preservingEmail?'preserved@example.invalid':input.email});
 if(preservingEmail)values.email=beforeInput.data.user.email;
 
 const before=await admin.getUserById(targetId);
 if(before.error||!before.data?.user||before.data.user.app_metadata?.role==='platform_admin')throw Error('Cuenta de destino no disponible para este cambio.');
 if(before.data.user.app_metadata?.credential_scheme==='qa_pin_v1'&&!before.data.user.app_metadata?.qa_credentials_changed&&!values.password)throw Error('Ingrese una nueva clave personal para sustituir la clave temporal.');
 if(values.email===before.data.user.email&&!values.password)throw Error('Ingrese un usuario diferente o una nueva clave.');
 const attributes={email:values.email,email_confirm:true,app_metadata:{...before.data.user.app_metadata,qa_credentials_changed:true}};
 if(values.password){attributes.password=values.password;attributes.user_metadata={...before.data.user.user_metadata,must_change_password:false};}
 const saved=await admin.updateUserById(targetId,attributes);
 if(saved.error||saved.data?.user?.id!==targetId)throw Error('No se pudo confirmar el cambio. Actualice los datos antes de reintentar; el usuario puede estar ocupado o la clave no cumplir la política de QA.');
 return {ok:true,userId:targetId,email:values.email,self:targetId===actorId};
}
