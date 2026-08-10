import {BillingProviderAdapter,BillingProviderError,PROVIDER_RESULTS,validateBillingDocumentRequest} from "./BillingProviderAdapter.mjs";

export class MockBillingProviderAdapter extends BillingProviderAdapter {
  constructor({scenario="success",latencyMs=0}={}){super();this.scenario=scenario;this.latencyMs=latencyMs;this.documents=new Map();this.byKey=new Map();}
  async emitInvoice(request){return this.#emit(request,"INVOICE");}
  async emitReceipt(request){return this.#emit(request,"RECEIPT");}
  async emitCreditNote(request){return this.#emit(request,"CREDIT_NOTE");}
  async emitDebitNote(request){return this.#emit(request,"DEBIT_NOTE");}
  async #emit(request,type){
    validateBillingDocumentRequest(request);
    if(this.latencyMs)await new Promise(resolve=>setTimeout(resolve,this.latencyMs));
    if(this.scenario==="timeout")throw new BillingProviderError("PROVIDER_TIMEOUT","Mock provider timeout.",{retryable:true});
    if(this.scenario==="error")throw new BillingProviderError("PROVIDER_TEMPORARY_ERROR","Mock provider temporary error.",{retryable:true});
    if(this.scenario==="rejection")return {result:PROVIDER_RESULTS.REJECTED,providerStatus:"REJECTED",providerCode:"MOCK_BUSINESS_REJECTION",retryable:false};
    const prior=this.byKey.get(request.idempotencyKey);if(prior)return {...prior,result:PROVIDER_RESULTS.DUPLICATE,duplicate:true};
    const id=`mock-${type.toLowerCase()}-${this.documents.size+1}`;
    const document={result:this.scenario==="pending"?PROVIDER_RESULTS.PENDING:PROVIDER_RESULTS.ISSUED,provider:"mock",providerDocumentId:id,providerStatus:this.scenario==="pending"?"PENDING":"ACCEPTED",folio:this.scenario==="pending"?null:`MOCK-${this.documents.size+1}`,documentType:type,retryable:this.scenario==="pending"};
    this.documents.set(id,document);this.byKey.set(request.idempotencyKey,document);return document;
  }
  async getDocument(id){return this.documents.get(id)||null;}
  async getDocumentStatus(id){const value=this.documents.get(id);return value?{providerDocumentId:id,status:value.providerStatus}:null;}
}
