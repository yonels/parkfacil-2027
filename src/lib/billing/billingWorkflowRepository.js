import "server-only";
import { adjustmentAmount, BillingWorkflowError, normalizeReviewComment, requireEditable, requireExpectedVersion, requireTransition, validateApproval } from "./billingWorkflowCore.mjs";
import { calculatePreinvoice } from "./preinvoiceCore.mjs";
import { UfRateService } from "./ufRateService";

function fail(error,message){if(error){error.message=`${message}: ${error.message}`;throw error;}}
async function row(db,id){const r=await db.from("billing_preinvoices").select("*,companies!inner(status),company_contracts!inner(status,starts_on,ends_on)").eq("id",id).maybeSingle();fail(r.error,"No fue posible resolver la prefactura");if(!r.data)throw new BillingWorkflowError("RESOURCE_NOT_FOUND","Prefactura no encontrada.",404);return r.data;}
async function audit(db,p,{action,actorId,from,to,reason=null,metadata={},requestId=null}){const r=await db.from("billing_audit_events").insert({company_id:p.company_id,preinvoice_id:p.id,action,actor_id:actorId,reason,previous_value:{status:from,version:p.version},new_value:{status:to,...metadata},request_id:requestId});fail(r.error,"No fue posible registrar auditoria");}
async function reserveVersion(db,current,expectedVersion){const r=await db.from("billing_preinvoices").update({version:current.version+1,updated_at:new Date().toISOString()}).eq("id",current.id).eq("version",expectedVersion).eq("status",current.status).select("version").maybeSingle();fail(r.error,"No fue posible reservar la prefactura");if(!r.data)throw new BillingWorkflowError("PREINVOICE_VERSION_CONFLICT","La prefactura fue modificada por otro usuario.");return r.data.version;}

export async function transitionPreinvoice(db,id,{target,action,actorId,expectedVersion,reason=null,requestId=null}){
  const current=await row(db,id);
  if(current.status===target)return {id,status:target,version:current.version,reused:true};
  requireExpectedVersion(current.version,expectedVersion);requireTransition(current.status,target);
  if(target==="APPROVED"){
    const count=await db.from("billing_preinvoice_lines").select("id",{count:"exact",head:true}).eq("preinvoice_id",id).eq("line_status","ACTIVE");fail(count.error,"No fue posible validar lineas");
    validateApproval({status:current.status,companyActive:current.companies?.status==="active",contractActive:current.company_contracts?.status==="active",lineCount:count.count,totalAmount:current.total_amount,currency:current.currency,ufIsProvisional:current.uf_is_provisional});
  }
  if(target==="CANCELLED"&&!String(reason||"").trim())throw new BillingWorkflowError("CANCELLATION_REASON_REQUIRED","El motivo es obligatorio.",422);
  const changes={status:target,version:current.version+1,updated_at:new Date().toISOString()};
  if(target==="APPROVED")Object.assign(changes,{approved_by:actorId,approved_at:new Date().toISOString(),uf_is_provisional:current.currency==="UF"});
  if(target==="CANCELLED")Object.assign(changes,{cancelled_by:actorId,cancelled_at:new Date().toISOString(),cancellation_reason:String(reason).trim()});
  const updated=await db.from("billing_preinvoices").update(changes).eq("id",id).eq("version",expectedVersion).eq("status",current.status).select("id,status,version").maybeSingle();fail(updated.error,"No fue posible cambiar estado");if(!updated.data)throw new BillingWorkflowError("PREINVOICE_VERSION_CONFLICT","La prefactura fue modificada por otro usuario.");
  await audit(db,current,{action,actorId,from:current.status,to:target,reason,requestId});return {...updated.data,reused:false};
}

export async function addPreinvoiceComment(db,id,{text,actorId,expectedVersion,requestId}){
  const current=await row(db,id);requireExpectedVersion(current.version,expectedVersion);requireEditable(current.status);
  const clean=normalizeReviewComment(text);
  const reservedVersion=await reserveVersion(db,current,expectedVersion);
  const inserted=await db.from("billing_preinvoice_comments").insert({company_id:current.company_id,preinvoice_id:id,text:clean,created_by:actorId}).select("*").single();fail(inserted.error,"No fue posible guardar observacion");
  await audit(db,current,{action:"COMMENT_ADDED",actorId,from:current.status,to:current.status,metadata:{commentId:inserted.data.id},requestId});return {...inserted.data,version:reservedVersion};
}

export async function addPreinvoiceAdjustment(db,id,input){
  const current=await row(db,id);requireExpectedVersion(current.version,input.expectedVersion);requireEditable(current.status);
  if(!String(input.reason||"").trim())throw new BillingWorkflowError("ADJUSTMENT_REASON_REQUIRED","El motivo es obligatorio.",422);
  if(input.currency!==current.currency)throw new BillingWorkflowError("ADJUSTMENT_CURRENCY_MISMATCH","El ajuste debe usar la moneda de la prefactura.",422);
  const quantity=Number(input.quantity),unitPrice=Number(input.unitPrice);const amount=adjustmentAmount({type:input.type,quantity,unitPrice});
  const reservedVersion=await reserveVersion(db,current,input.expectedVersion);
  const adjustment=await db.from("billing_preinvoice_adjustments").insert({company_id:current.company_id,preinvoice_id:id,original_line_id:input.originalLineId||null,concept_id:input.conceptId,adjustment_type:input.type,description:input.description,quantity,unit:input.unit||"unit",unit_price:unitPrice,currency:input.currency,amount,reason:String(input.reason).trim(),created_by:input.actorId}).select("*").single();fail(adjustment.error,"No fue posible crear ajuste");
  const line=await db.from("billing_preinvoice_lines").insert({company_id:current.company_id,preinvoice_id:id,concept_id:input.conceptId,contract_item_id:null,adjustment_id:adjustment.data.id,source_type:"MANUAL",source_key:`adjustment:${adjustment.data.id}`,description:input.description,quantity,unit:input.unit||"unit",unit_price:unitPrice,currency:input.currency,subtotal:amount,tax_amount:0,total_amount:amount,valid_from:`${current.period}-01`,valid_to:new Date(Date.UTC(Number(current.period.slice(0,4)),Number(current.period.slice(5,7)),0)).toISOString().slice(0,10)});fail(line.error,"No fue posible crear linea de ajuste");
  const nextNet=Number(current.net_amount)+amount,nextTotal=Number(current.total_amount)+amount;
  const updated=await db.from("billing_preinvoices").update({net_amount:nextNet,total_amount:nextTotal,updated_at:new Date().toISOString()}).eq("id",id).eq("version",reservedVersion).select("version").maybeSingle();if(!updated.data)throw new BillingWorkflowError("PREINVOICE_VERSION_CONFLICT","La prefactura fue modificada por otro usuario.");
  await audit(db,current,{action:"ADJUSTMENT_ADDED",actorId:input.actorId,from:current.status,to:current.status,reason:input.reason,metadata:{adjustmentId:adjustment.data.id,amount},requestId:input.requestId});return {...adjustment.data,version:reservedVersion};
}

export async function removePreinvoiceAdjustment(db,id,adjustmentId,{actorId,expectedVersion,reason,requestId}){
  const current=await row(db,id);requireExpectedVersion(current.version,expectedVersion);requireEditable(current.status);
  if(!String(reason||"").trim())throw new BillingWorkflowError("ADJUSTMENT_REASON_REQUIRED","El motivo es obligatorio.",422);
  const found=await db.from("billing_preinvoice_adjustments").select("*").eq("id",adjustmentId).eq("preinvoice_id",id).eq("company_id",current.company_id).eq("status","ACTIVE").maybeSingle();fail(found.error,"No fue posible resolver ajuste");if(!found.data)throw new BillingWorkflowError("RESOURCE_NOT_FOUND","Ajuste no encontrado.",404);
  const reservedVersion=await reserveVersion(db,current,expectedVersion);
  const changed=await db.from("billing_preinvoice_adjustments").update({status:"REMOVED",removed_by:actorId,removed_at:new Date().toISOString(),removal_reason:String(reason).trim()}).eq("id",adjustmentId).eq("status","ACTIVE");fail(changed.error,"No fue posible retirar ajuste");
  const line=await db.from("billing_preinvoice_lines").update({line_status:"REMOVED"}).eq("adjustment_id",adjustmentId);fail(line.error,"No fue posible retirar linea de ajuste");
  const amount=Number(found.data.amount);const updated=await db.from("billing_preinvoices").update({net_amount:Number(current.net_amount)-amount,total_amount:Number(current.total_amount)-amount,updated_at:new Date().toISOString()}).eq("id",id).eq("version",reservedVersion).select("version").maybeSingle();if(!updated.data)throw new BillingWorkflowError("PREINVOICE_VERSION_CONFLICT","La prefactura fue modificada por otro usuario.");
  await audit(db,current,{action:"ADJUSTMENT_REMOVED",actorId,from:current.status,to:current.status,reason,metadata:{adjustmentId,amount},requestId});return {id:adjustmentId,status:"REMOVED",version:reservedVersion};
}

export async function recalculatePreinvoice(db,id,{actorId,expectedVersion,requestId,ufRateService=new UfRateService()}){
  const current=await row(db,id);requireExpectedVersion(current.version,expectedVersion);requireEditable(current.status);
  const reservedVersion=await reserveVersion(db,current,expectedVersion);
  const contract={id:current.contract_id,companyId:current.company_id,currency:current.currency,startsOn:current.company_contracts.starts_on,endsOn:current.company_contracts.ends_on};
  const source=await db.from("contract_billable_items").select("*").eq("company_id",current.company_id).eq("contract_id",current.contract_id).eq("status","ACTIVE");fail(source.error,"No fue posible resolver items contractuales");
  const items=(source.data||[]).map(x=>({contractItemId:x.id,conceptId:x.concept_id,itemType:x.item_type,description:x.description,quantity:Number(x.quantity),includedQuantity:Number(x.included_quantity),unit:x.unit,unitPrice:Number(x.unit_price),currency:x.currency,classification:x.commercial_classification,validFrom:x.valid_from,validTo:x.valid_to,status:x.status,parkingId:x.parking_id,deviceId:x.device_id}));
  const calculation=await calculatePreinvoice({contract,items,period:current.period,ufDate:current.currency==="UF"?(current.uf_date||new Date().toISOString().slice(0,10)):null,ufRateService});
  const removed=await db.from("billing_preinvoice_lines").delete().eq("preinvoice_id",id).is("adjustment_id",null);fail(removed.error,"No fue posible regenerar lineas");
  const rows=calculation.lines.map(line=>({preinvoice_id:id,company_id:current.company_id,concept_id:line.conceptId,contract_item_id:line.contractItemId,parking_id:line.parkingId,device_id:line.deviceId,source_type:line.sourceType,source_key:line.sourceKey,description:line.description,quantity:line.quantity,unit:line.unit,unit_price:line.unitPrice,currency:line.currency,subtotal:line.subtotal,tax_amount:line.taxAmount,total_amount:line.totalAmount,valid_from:line.validFrom,valid_to:line.validTo}));
  const inserted=await db.from("billing_preinvoice_lines").insert(rows);fail(inserted.error,"No fue posible regenerar lineas");
  const adjustments=await db.from("billing_preinvoice_adjustments").update({status:"REQUIRES_REVIEW"}).eq("preinvoice_id",id).eq("status","ACTIVE");fail(adjustments.error,"No fue posible marcar ajustes");
  const updated=await db.from("billing_preinvoices").update({status:"CALCULATED",net_amount:calculation.netAmount,tax_amount:calculation.taxAmount,total_amount:calculation.totalAmount,uf_date:calculation.uf?.date||current.uf_date,uf_value:calculation.uf?.value||current.uf_value,converted_amount_clp:calculation.uf?.convertedAmountClp||current.converted_amount_clp,uf_source:calculation.uf?.source||current.uf_source,uf_is_provisional:current.currency==="UF",updated_at:new Date().toISOString()}).eq("id",id).eq("version",reservedVersion).select("id,status,version").maybeSingle();if(!updated.data)throw new BillingWorkflowError("PREINVOICE_VERSION_CONFLICT","La prefactura fue modificada por otro usuario.");
  await audit(db,current,{action:"RECALCULATED",actorId,from:current.status,to:"CALCULATED",metadata:{lineCount:rows.length,adjustments:"REQUIRES_REVIEW"},requestId});return updated.data;
}
