import "server-only";
import { randomUUID } from "node:crypto";
import { BillingValidationError, calculatePreinvoice, parseBillingPeriod } from "./preinvoiceCore.mjs";
import { UfRateService } from "./ufRateService";

const HEADER_SELECT = "id,internal_number,company_id,contract_id,period,currency,status,calculated_at,due_date,net_amount,tax_amount,total_amount,contract_amount_uf,uf_date,uf_value,converted_amount_clp,uf_source,uf_status,calculation_issue_code,created_at,companies(business_name,rut_number,rut_dv),company_contracts(contract_number)";

function fail(error, fallback) { if (error) { error.message = `${fallback}: ${error.message}`; throw error; } }
function number(value) { return Number(value || 0); }

export function mapPreinvoice(row) {
  const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
  const contract = Array.isArray(row.company_contracts) ? row.company_contracts[0] : row.company_contracts;
  return { id:row.id, prefactura:row.internal_number, cliente:company?.business_name||"", rut:company?`${company.rut_number}-${company.rut_dv}`:"", contrato:contract?.contract_number||"", periodo:row.period, moneda:row.currency, neto:number(row.net_amount), impuesto:number(row.tax_amount), total:number(row.total_amount), estado:row.status, fechaCalculo:row.calculated_at, vencimiento:row.due_date, ufDate:row.uf_date, ufValue:row.uf_value == null ? null : number(row.uf_value), convertedAmountClp:row.converted_amount_clp == null ? null : number(row.converted_amount_clp), ufStatus:row.uf_status, issueCode:row.calculation_issue_code };
}

export async function listPreinvoices(db, { companyId = null, period = null } = {}) {
  let query = db.from("billing_preinvoices").select(HEADER_SELECT).order("created_at", { ascending:false }).limit(500);
  if (companyId) query=query.eq("company_id",companyId);
  if (period) query=query.eq("period",period);
  const {data,error}=await query; fail(error,"No fue posible listar prefacturas"); return (data||[]).map(mapPreinvoice);
}

export async function getPreinvoice(db, id, companyId = null) {
  let query=db.from("billing_preinvoices").select(`${HEADER_SELECT},version,uf_is_provisional,billing_preinvoice_lines(id,concept_id,description,quantity,unit,unit_price,currency,subtotal,tax_amount,total_amount,source_type,contract_item_id,parking_id,device_id,valid_from,valid_to,line_status,adjustment_id,billable_concepts(code,name),parkings(name,code),billing_devices(name,identifier,device_type)),billing_preinvoice_comments(id,text,created_by,created_at),billing_preinvoice_adjustments(id,adjustment_type,description,amount,currency,reason,status,original_line_id,created_by,created_at),billing_audit_events(id,action,actor_id,reason,previous_value,new_value,created_at)`).eq("id",id);
  if(companyId) query=query.eq("company_id",companyId);
  const {data,error}=await query.maybeSingle(); fail(error,"No fue posible obtener la prefactura");
  if(!data)return null;
  return {...mapPreinvoice(data),version:data.version,ufIsProvisional:data.uf_is_provisional,lines:(data.billing_preinvoice_lines||[]).map(line=>({...line,quantity:number(line.quantity),unit_price:number(line.unit_price),subtotal:number(line.subtotal),tax_amount:number(line.tax_amount),total_amount:number(line.total_amount)})),comments:data.billing_preinvoice_comments||[],adjustments:data.billing_preinvoice_adjustments||[],audit:data.billing_audit_events||[]};
}

function ufDateFor(period) {
  const range=parseBillingPeriod(period); const rule=process.env.BILLING_UF_DATE_RULE||"UNCONFIGURED";
  if(rule==="PERIOD_START")return range.from;
  if(rule==="PERIOD_END")return range.to;
  if(rule==="CALCULATION_DATE")return new Date().toISOString().slice(0,10);
  return null;
}

function mapContract(row){return{id:row.id,companyId:row.company_id,currency:row.currency,startsOn:row.starts_on,endsOn:row.ends_on,paymentDueDays:Number(row.payment_due_days||0)};}
function mapItem(row){return{contractItemId:row.id,conceptId:row.concept_id,itemType:row.item_type,description:row.description,quantity:number(row.quantity),includedQuantity:number(row.included_quantity),unit:row.unit,unitPrice:number(row.unit_price),currency:row.currency,classification:row.commercial_classification,validFrom:row.valid_from,validTo:row.valid_to,status:row.status,parkingId:row.parking_id,deviceId:row.device_id};}

export async function calculatePeriodPreinvoices(db,{period,actorId,idempotencyKey,companyId=null,ufRateService=new UfRateService()}){
  const range=parseBillingPeriod(period);
  let contractsQuery=db.from("company_contracts").select("id,company_id,contract_number,currency,starts_on,ends_on,payment_due_days,companies!inner(status,relationship_type)").eq("status","active").lte("starts_on",range.to).gte("ends_on",range.from).eq("companies.status","active").eq("companies.relationship_type","client");
  if(companyId)contractsQuery=contractsQuery.eq("company_id",companyId);
  const {data:contracts,error:contractsError}=await contractsQuery; fail(contractsError,"No fue posible resolver contratos");
  const results=[];
  for(const row of contracts||[]){
    const contract=mapContract(row); const key=`${idempotencyKey}:${contract.id}:${period}`;
    const existing=await db.from("billing_preinvoices").select("id").eq("idempotency_key",key).maybeSingle(); fail(existing.error,"No fue posible verificar idempotencia");
    if(existing.data){results.push({id:existing.data.id,reused:true});continue;}
    const itemsResult=await db.from("contract_billable_items").select("*").eq("company_id",contract.companyId).eq("contract_id",contract.id).eq("status","ACTIVE").lte("valid_from",range.to).or(`valid_to.is.null,valid_to.gte.${range.from}`);
    fail(itemsResult.error,"No fue posible resolver items contractuales");
    let calculation;
    try{calculation=await calculatePreinvoice({contract,items:(itemsResult.data||[]).map(mapItem),period,ufDate:ufDateFor(period),ufRateService});}
    catch(error){if(error instanceof BillingValidationError){results.push({contractId:contract.id,status:"BLOCKED",code:error.code,message:error.message});continue;}throw error;}
    const due=new Date(`${range.to}T00:00:00Z`); due.setUTCDate(due.getUTCDate()+contract.paymentDueDays);
    const internalNumber=`PRE-${period.replace("-","")}-${randomUUID().slice(0,8).toUpperCase()}`;
    const header={internal_number:internalNumber,company_id:contract.companyId,contract_id:contract.id,period,currency:contract.currency,status:"CALCULATED",calculated_at:new Date().toISOString(),due_date:due.toISOString().slice(0,10),net_amount:calculation.netAmount,tax_amount:calculation.taxAmount,total_amount:calculation.totalAmount,contract_amount_uf:contract.currency==="UF"?calculation.totalAmount:null,uf_date:calculation.uf?.date||null,uf_value:calculation.uf?.value||null,converted_amount_clp:calculation.uf?.convertedAmountClp||null,uf_source:calculation.uf?.source||null,uf_status:contract.currency==="UF"?"RESOLVED":"NOT_APPLICABLE",idempotency_key:key,created_by:actorId};
    const inserted=await db.from("billing_preinvoices").insert(header).select("id").single(); fail(inserted.error,"No fue posible crear prefactura");
    const lineRows=calculation.lines.map(line=>({preinvoice_id:inserted.data.id,company_id:contract.companyId,concept_id:line.conceptId,contract_item_id:line.contractItemId,parking_id:line.parkingId,device_id:line.deviceId,source_type:line.sourceType,source_key:line.sourceKey,description:line.description,quantity:line.quantity,unit:line.unit,unit_price:line.unitPrice,currency:line.currency,subtotal:line.subtotal,tax_amount:line.taxAmount,total_amount:line.totalAmount,valid_from:line.validFrom,valid_to:line.validTo}));
    const linesInsert=await db.from("billing_preinvoice_lines").insert(lineRows); if(linesInsert.error){await db.from("billing_preinvoices").delete().eq("id",inserted.data.id);fail(linesInsert.error,"No fue posible crear lineas");}
    const audit=await db.from("billing_audit_events").insert({company_id:contract.companyId,preinvoice_id:inserted.data.id,action:"CALCULATE",actor_id:actorId,new_value:{period,lineCount:lineRows.length,total:calculation.totalAmount},request_id:idempotencyKey}); fail(audit.error,"No fue posible auditar calculo");
    results.push({id:inserted.data.id,reused:false});
  }
  return {period,results};
}
