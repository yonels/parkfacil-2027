import test from "node:test";import assert from "node:assert/strict";
import {MockBillingProviderAdapter} from "./MockBillingProviderAdapter.mjs";

const request={idempotencyKey:"issue-1",documentType:"INVOICE",issueDate:"2026-08-10",currency:"CLP",issuer:{rut:"1-9"},customer:{rut:"2-7"},lines:[{description:"Fee",quantity:1,unitPrice:1000}],totals:{net:1000,tax:0,total:1000}};
test("mock simula emisión exitosa",async()=>assert.equal((await new MockBillingProviderAdapter().emitInvoice(request)).result,"ISSUED"));
test("mock simula estado pendiente",async()=>assert.equal((await new MockBillingProviderAdapter({scenario:"pending"}).emitInvoice(request)).result,"PENDING"));
test("mock simula rechazo no recuperable",async()=>{const r=await new MockBillingProviderAdapter({scenario:"rejection"}).emitInvoice(request);assert.equal(r.result,"REJECTED");assert.equal(r.retryable,false);});
test("mock clasifica timeout recuperable",async()=>assert.rejects(()=>new MockBillingProviderAdapter({scenario:"timeout"}).emitInvoice(request),e=>e.code==="PROVIDER_TIMEOUT"&&e.retryable));
test("mock es determinístico y no depende de memoria temporal",async()=>{const first=await new MockBillingProviderAdapter().emitInvoice(request),second=await new MockBillingProviderAdapter().emitInvoice(request);assert.equal(second.providerDocumentId,first.providerDocumentId);assert.equal(second.folio,first.folio);});
test("mock delega persistencia y consulta al repositorio",async()=>{const p=new MockBillingProviderAdapter();assert.equal(await p.getDocument("mock-id"),null);assert.equal(await p.getDocumentStatus("mock-id"),null);});
test("mock emite NC y ND con contrato neutral",async()=>{const p=new MockBillingProviderAdapter(),nc=await p.emitCreditNote({...request,idempotencyKey:"nc-key-123",documentType:"CREDIT_NOTE"}),nd=await p.emitDebitNote({...request,idempotencyKey:"nd-key-123",documentType:"DEBIT_NOTE"});assert.equal(nc.documentType,"CREDIT_NOTE");assert.equal(nd.documentType,"DEBIT_NOTE")});
