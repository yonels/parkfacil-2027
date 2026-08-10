import { NextResponse } from "next/server";
import { authorizeRemainingRequest, remainingAuthorizationError, remainingCompanyScope } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { BillingValidationError } from "@/lib/billing/preinvoiceCore.mjs";
import { calculatePeriodPreinvoices } from "@/lib/billing/preinvoiceRepository";

export async function POST(request){
  const auth=await authorizeRemainingRequest(request,PERMISSIONS.BILLING_MANAGE);if(auth.response)return auth.response;
  try{const body=await request.json();const key=request.headers.get("idempotency-key")||"";if(!key||key.length>200)return NextResponse.json({error:"Idempotency-Key es obligatorio.",code:"IDEMPOTENCY_KEY_REQUIRED"},{status:422});const data=await calculatePeriodPreinvoices(auth.db,{period:body.period,actorId:auth.context.userId,idempotencyKey:key,companyId:remainingCompanyScope(auth.context)});return NextResponse.json({data},{status:201});}
  catch(error){if(error instanceof BillingValidationError)return NextResponse.json({error:error.message,code:error.code,details:error.details},{status:422});if(error?.code==="23505")return NextResponse.json({error:"La prefactura o una de sus lineas ya existe para el periodo.",code:"BILLING_DUPLICATE"},{status:409});return remainingAuthorizationError(request,auth.context,error)||NextResponse.json({error:"No fue posible calcular la prefacturacion.",code:"BILLING_CALCULATION_FAILED"},{status:500});}
}
