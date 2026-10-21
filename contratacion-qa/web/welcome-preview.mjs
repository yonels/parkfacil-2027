export function welcomePreview({company,members=[],previouslyActivated=false}) {
 const active = company?.status === 'active' && members.length === 3 && members.every(m => m.status === 'active');
 if (active) return {subject:'Su cuenta ParkFacil ha sido activada',body:'La empresa y sus tres cuentas están activadas. Los accesos operativos siguen sujetos a los permisos de cada cuenta.'};
 if (company?.status === 'inactive' && previouslyActivated) return {subject:'Su cuenta ParkFacil ha sido desactivada',body:'La empresa está desactivada. Sus cuentas e historial se conservan; el acceso operativo está bloqueado hasta una nueva activación autorizada por Root.'};
 if (company?.status === 'active') return {subject:'Revise el estado de sus accesos ParkFacil',body:'La empresa está activa, pero no se ha confirmado que las tres cuentas estén activas. Revise el estado individual en Gestión.'};
 return {subject:'Su cuenta ParkFacil ha sido creada',body:'Cuenta creada e inactiva. El acceso operativo está bloqueado. Revise en Gestión los requisitos comerciales pendientes y la autorización de Root. Este estado por sí solo no permite distinguir una primera activación pendiente de una desactivación posterior.'};
}
