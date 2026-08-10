export const PROVIDER_RESULTS = Object.freeze({ ISSUED:"ISSUED", PENDING:"PENDING", REJECTED:"REJECTED", DUPLICATE:"DUPLICATE" });

export class BillingProviderError extends Error {
  constructor(code,message,{retryable=false}={}){super(message);this.name="BillingProviderError";this.code=code;this.retryable=retryable;}
}

export class BillingProviderAdapter {
  async emitInvoice(){throw new BillingProviderError("NOT_IMPLEMENTED","El proveedor no implementa emisión de factura.");}
  async emitReceipt(){throw new BillingProviderError("NOT_IMPLEMENTED","El proveedor no implementa emisión de boleta.");}
  async emitCreditNote(){throw new BillingProviderError("NOT_IMPLEMENTED","El proveedor no implementa nota de crédito.");}
  async emitDebitNote(){throw new BillingProviderError("NOT_IMPLEMENTED","El proveedor no implementa nota de débito.");}
  async getDocument(){throw new BillingProviderError("NOT_IMPLEMENTED","El proveedor no implementa consulta de documento.");}
  async getDocumentStatus(){throw new BillingProviderError("NOT_IMPLEMENTED","El proveedor no implementa consulta de estado.");}
}

export function validateBillingDocumentRequest(request){
  const required=["idempotencyKey","documentType","issueDate","currency","issuer","customer","lines","totals"];
  const missing=required.filter(key=>request?.[key]==null||request[key]==="");
  if(missing.length)throw new BillingProviderError("INVALID_DOCUMENT_REQUEST",`Faltan campos internos: ${missing.join(", ")}.`);
  if(!Array.isArray(request.lines)||!request.lines.length)throw new BillingProviderError("DOCUMENT_LINES_REQUIRED","El documento requiere líneas.");
  return request;
}
