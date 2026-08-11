import {NextResponse} from "next/server";
import {authorizeRemainingRequest,remainingCompanyScope} from "@/lib/auth/remainingAuthorization";
import {PERMISSIONS} from "@/lib/auth/permissions.mjs";
import {recordBillingPayment} from "@/lib/billing/accountRepository";

const MESSAGES={PAYMENT_COMPANY_REQUIRED:"Selecciona un cliente.",INVALID_MOVEMENT_AMOUNT:"El monto debe ser mayor que cero.",PAYMENT_DATE_INVALID:"La fecha de pago no es válida.",PAYMENT_CURRENCY_INVALID:"La moneda no es válida.",PAYMENT_REFERENCE_INVALID:"La referencia es obligatoria.",PAYMENT_DESCRIPTION_INVALID:"La descripción es obligatoria.",PAYMENT_METHOD_INVALID:"El medio de pago no es válido.",PAYMENT_IDEMPOTENCY_INVALID:"La clave de idempotencia no es válida.",PAYMENT_COMPANY_INVALID:"Cliente no encontrado o inactivo."};

export async function POST(request){
  const auth=await authorizeRemainingRequest(request,PERMISSIONS.BILLING_MANAGE);if(auth.response)return auth.response;
  try{
    const body=await request.json(),scope=remainingCompanyScope(auth.context),companyId=scope||String(body.companyId||"").trim();
    if(scope&&body.companyId&&body.companyId!==scope)return NextResponse.json({error:"Cliente no encontrado.",code:"RESOURCE_NOT_FOUND"},{status:404});
    const idempotencyKey=String(request.headers.get("idempotency-key")||"").trim();
    const data=await recordBillingPayment(auth.db,{...body,companyId,idempotencyKey,actorId:auth.context.userId});
    return NextResponse.json({data},{status:data.reused?200:201});
  }catch(error){const code=error.code||error.message||"PAYMENT_RECORD_FAILED";return NextResponse.json({error:MESSAGES[code]||"No fue posible registrar el pago.",code},{status:MESSAGES[code]?422:500});}
}
