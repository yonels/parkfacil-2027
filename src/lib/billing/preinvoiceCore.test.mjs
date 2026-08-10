import test from "node:test";
import assert from "node:assert/strict";
import { BillingValidationError, calculatePreinvoice, parseBillingPeriod, preinvoiceSourceKey } from "./preinvoiceCore.mjs";

const contract = { id: "contract-1", companyId: "company-1", currency: "CLP", startsOn: "2026-01-01", endsOn: "2026-12-31" };
const item = (overrides={}) => ({ contractItemId:"item-1", conceptId:"fee", itemType:"FEE", description:"Fee congelado", quantity:1, includedQuantity:0, unit:"month", unitPrice:1000, currency:"CLP", classification:"ADDITIONAL", validFrom:"2026-01-01", validTo:null, status:"ACTIVE", ...overrides });

test("valida y expande el periodo",()=>assert.deepEqual(parseBillingPeriod("2026-08"),{period:"2026-08",from:"2026-08-01",to:"2026-08-31"}));
test("calcula contrato CLP y totales sin inventar impuesto",async()=>{const r=await calculatePreinvoice({contract,items:[item()],period:"2026-08"});assert.equal(r.totalAmount,1000);assert.equal(r.taxAmount,0);});
test("usa precio contractual congelado",async()=>{const r=await calculatePreinvoice({contract,items:[item({unitPrice:300})],period:"2026-08"});assert.equal(r.lines[0].unitPrice,300);});
test("device incluido no genera cargo",async()=>{const r=await calculatePreinvoice({contract,items:[item({itemType:"DEVICE",deviceId:"pos-1",classification:"INCLUDED"}),item({contractItemId:"fee-2"})],period:"2026-08"});assert.equal(r.lines.some(x=>x.deviceId==="pos-1"),false);});
test("device adicional queda trazado",async()=>{const r=await calculatePreinvoice({contract,items:[item({itemType:"DEVICE",deviceId:"pos-3",classification:"ADDITIONAL"})],period:"2026-08"});assert.equal(r.lines[0].deviceId,"pos-3");});
test("excluye items fuera de vigencia",async()=>{await assert.rejects(()=>calculatePreinvoice({contract,items:[item({validTo:"2026-07-31"})],period:"2026-08"}),e=>e.code==="CONTRACT_ITEMS_MISSING");});
test("rechaza periodo invalido",()=>assert.throws(()=>parseBillingPeriod("08-2026"),BillingValidationError));
test("source key protege contrato item device y periodo",()=>assert.equal(preinvoiceSourceKey(item({deviceId:"d-1"}),"2026-08"),"item-1:fee:d-1:2026-08"));
test("calcula contrato UF con servicio mock",async()=>{const r=await calculatePreinvoice({contract:{...contract,currency:"UF"},items:[item({currency:"UF",unitPrice:2})],period:"2026-08",ufDate:"2026-08-31",ufRateService:{getUfByDate:async()=>({date:"2026-08-31",value:40000})}});assert.equal(r.uf.convertedAmountClp,80000);});
test("falla explicitamente si UF no esta disponible",async()=>{await assert.rejects(()=>calculatePreinvoice({contract:{...contract,currency:"UF"},items:[item({currency:"UF"})],period:"2026-08",ufDate:"2026-08-31",ufRateService:{getUfByDate:async()=>{throw new Error("down")}}}),e=>e.code==="UF_RATE_UNAVAILABLE");});
test("aislamiento exige que motor reciba contrato e items del mismo contexto monetario",async()=>{await assert.rejects(()=>calculatePreinvoice({contract,items:[item({currency:"UF"})],period:"2026-08"}),e=>e.code==="MIXED_CONTRACT_CURRENCY");});
