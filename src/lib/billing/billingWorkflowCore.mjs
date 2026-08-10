export class BillingWorkflowError extends Error { constructor(code,message,status=409){super(message);this.name="BillingWorkflowError";this.code=code;this.status=status;} }

export const TRANSITIONS=Object.freeze({
  DRAFT:new Set(["CALCULATED","CANCELLED"]),
  CALCULATED:new Set(["UNDER_REVIEW","CANCELLED"]),
  UNDER_REVIEW:new Set(["CALCULATED","APPROVED","CANCELLED"]),
  APPROVED:new Set(["READY_TO_ISSUE"]),
  READY_TO_ISSUE:new Set(), CANCELLED:new Set(),
});
export const BILLING_AUDIT_ACTIONS=Object.freeze(["REVIEW_STARTED","COMMENT_ADDED","ADJUSTMENT_ADDED","ADJUSTMENT_REMOVED","RECALCULATED","APPROVED","MARKED_READY_TO_ISSUE","CANCELLED"]);

export function requireTransition(from,to){if(!TRANSITIONS[from]?.has(to))throw new BillingWorkflowError("INVALID_BILLING_TRANSITION",`No se permite cambiar de ${from} a ${to}.`);return true;}
export function requireEditable(status){if(!["DRAFT","CALCULATED","UNDER_REVIEW"].includes(status))throw new BillingWorkflowError("PREINVOICE_LOCKED","La prefactura ya no admite modificaciones.");}
export function requireExpectedVersion(current,expected){if(!Number.isInteger(expected)||current!==expected)throw new BillingWorkflowError("PREINVOICE_VERSION_CONFLICT","La prefactura fue modificada por otro usuario.");}
export function normalizeReviewComment(text){const value=String(text||"").trim();if(!value)throw new BillingWorkflowError("COMMENT_REQUIRED","La observacion es obligatoria.",422);return value.slice(0,2000);}
export function adjustmentAmount({type,quantity,unitPrice}){const q=Number(quantity),price=Number(unitPrice);if(!Number.isFinite(q)||!Number.isFinite(price)||q===0||price<0)throw new BillingWorkflowError("INVALID_ADJUSTMENT","Cantidad o precio de ajuste invalido.",422);return Math.round((type==="DISCOUNT"?-1:1)*Math.abs(q)*price*10000)/10000;}
export function validateApproval(preinvoice){
  if(preinvoice.status!=="UNDER_REVIEW")throw new BillingWorkflowError("INVALID_BILLING_TRANSITION","La prefactura debe estar en revision.");
  if(!preinvoice.companyActive)throw new BillingWorkflowError("COMPANY_INACTIVE","La empresa no esta activa.",422);
  if(!preinvoice.contractActive)throw new BillingWorkflowError("CONTRACT_INACTIVE","El contrato no esta vigente.",422);
  if(!preinvoice.lineCount)throw new BillingWorkflowError("PREINVOICE_LINES_REQUIRED","La prefactura no posee lineas.",422);
  if(Number(preinvoice.totalAmount)<0)throw new BillingWorkflowError("INVALID_TOTAL","El total no es valido.",422);
  return true;
}
