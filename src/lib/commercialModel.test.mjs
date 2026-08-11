import test from"node:test";import assert from"node:assert/strict";import{contractParkingCount,groupPlanAssignments,resolveContractPlan,resolvePrimaryContract}from"./commercialModel.mjs";
test("empresa con contrato y plan resuelve código, nombre y versión",()=>assert.deepEqual(resolveContractPlan({planVersion:{version:2,plan:{codigo:"PF-PLAN-001",nombre:"Premium"}}}),{code:"PF-PLAN-001",name:"Premium",version:2}));
test("empresa sin plan no recibe equivalencia inventada",()=>assert.equal(resolveContractPlan({legacy:"ENTERPRISE"}),null));
test("plan admite múltiples empresas",()=>assert.equal(new Set(groupPlanAssignments([{id:"a",company_id:"A"},{id:"b",company_id:"B"}]).map(x=>x.companyId)).size,2));
test("plan sin asignaciones queda vacío",()=>assert.deepEqual(groupPlanAssignments([]),[]));
test("contrato cuenta estacionamientos reales sin duplicados",()=>assert.equal(contractParkingCount({parkingIds:["p1","p2","p2"]}),2));
test("navegación parte del contrato principal activo",()=>assert.equal(resolvePrimaryContract([{id:"old",estado:"expired"},{id:"current",estado:"active"}]).id,"current"));
