import {BillingProviderError,PROVIDER_RESULTS} from "./providers/BillingProviderAdapter.mjs";

export class BillingServiceError extends Error{constructor(code,message,{retryable=false}={}){super(message);this.name="BillingServiceError";this.code=code;this.retryable=retryable;}}
export class BillingService{
  constructor({repository,provider,ufRateService}){this.repository=repository;this.provider=provider;this.ufRateService=ufRateService;}
  async issueInvoice({preinvoiceId,invoiceDate,idempotencyKey,actorId}){
    const p=await this.repository.getReadyPreinvoice(preinvoiceId);if(!p||p.status!=="READY_TO_ISSUE")throw new BillingServiceError("PREINVOICE_NOT_READY","La prefactura no esta lista para emitir.");
    for(const [key,value] of Object.entries({businessName:p.customer?.businessName,rut:p.customer?.rut,businessActivity:p.customer?.businessActivity,address:p.customer?.address,district:p.customer?.district,city:p.customer?.city,billingEmail:p.customer?.billingEmail}))if(!String(value||"").trim())throw new BillingServiceError("FISCAL_DATA_MISSING",`Falta dato fiscal: ${key}.`);
    if(!p.lines?.length)throw new BillingServiceError("DOCUMENT_LINES_REQUIRED","La prefactura no posee lineas.");
    if(p.lines.some(x=>!x.taxCategory||x.taxCategory==="UNDEFINED"))throw new BillingServiceError("TAX_CLASSIFICATION_REQUIRED","Existen conceptos sin clasificacion tributaria.");
    let definitive={currency:p.currency,net:p.netAmount,tax:p.taxAmount,total:p.totalAmount};
    if(p.currency==="UF"){
      let rate;try{rate=await this.ufRateService.getUfByDate(invoiceDate);}catch{throw new BillingServiceError("BCCH_UNAVAILABLE","No fue posible obtener la UF definitiva.",{retryable:true});}
      definitive={...definitive,ufReferenceDate:invoiceDate,ufValue:rate.value,ufSource:"Banco Central de Chile",amountUf:p.totalAmount,convertedAmountClp:Math.round(p.totalAmount*rate.value),currency:"CLP",total:Math.round(p.totalAmount*rate.value)};
    }
    await this.repository.markIssuing({preinvoiceId,idempotencyKey,actorId,invoiceDate,definitive});
    const request={idempotencyKey,documentType:"INVOICE",issueDate:invoiceDate,currency:definitive.currency,issuer:p.issuer,customer:p.customer,lines:p.lines,totals:{net:definitive.net,tax:definitive.tax,total:definitive.total},references:{preinvoiceId,contractId:p.contractId},metadata:{period:p.period}};
    let result;try{result=await this.provider.emitInvoice(request);}catch(error){await this.repository.markIssueError({preinvoiceId,idempotencyKey,code:error.code});throw new BillingServiceError(error.code||"PROVIDER_ERROR",error.message,{retryable:error.retryable});}
    const status=result.result===PROVIDER_RESULTS.ISSUED?"ISSUED":result.result===PROVIDER_RESULTS.PENDING?"PROVIDER_PENDING":result.result===PROVIDER_RESULTS.REJECTED?"PROVIDER_REJECTED":"ISSUED";
    return this.repository.saveProviderResult({preinvoiceId,idempotencyKey,actorId,invoiceDate,definitive,result,status});
  }
  async issueRelatedDocument(input){
    const{validateRelatedInput}=await import("./documentCore.mjs");validateRelatedInput(input);
    const origin=await this.repository.getDocumentForIssue(input.originId,input.companyId);if(!origin)throw new BillingServiceError("ORIGIN_DOCUMENT_NOT_FOUND","Factura origen no encontrada.");
    const reserved=await this.repository.beginRelated(input);if(reserved.reused)return reserved;
    const document=await this.repository.getDocumentForProvider(reserved.documentId);
    const request={idempotencyKey:input.idempotencyKey,documentType:input.documentType,issueDate:input.issueDate,currency:document.currency,issuer:{provider:"mock"},customer:document.customer_snapshot,lines:document.lines,totals:{net:Number(document.net_amount),tax:Number(document.tax_amount),total:Number(document.total_amount)},reference:{documentId:origin.id,folio:origin.folio},reason:input.reason};
    let result;try{result=input.documentType==="CREDIT_NOTE"?await this.provider.emitCreditNote(request):await this.provider.emitDebitNote(request);}catch(error){await this.repository.finalizeRelated({...input,documentId:reserved.documentId,status:"ISSUE_ERROR",providerStatus:error.code});throw new BillingServiceError(error.code||"PROVIDER_ERROR",error.message,{retryable:error.retryable});}
    const status=result.result===PROVIDER_RESULTS.ISSUED||result.result===PROVIDER_RESULTS.DUPLICATE?"ISSUED":result.result===PROVIDER_RESULTS.PENDING?"PROVIDER_PENDING":"PROVIDER_REJECTED";
    return this.repository.finalizeRelated({...input,documentId:reserved.documentId,status,providerDocumentId:result.providerDocumentId,providerStatus:result.providerStatus||result.providerCode,folio:result.folio});
  }
}
