import { NextResponse } from "next/server";
import { authorizeRemainingRequest, remainingAuthorizationError, remainingCompanyScope } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { listPreinvoices } from "@/lib/billing/preinvoiceRepository";

export async function GET(request){
  const auth=await authorizeRemainingRequest(request,PERMISSIONS.BILLING_READ); if(auth.response)return auth.response;
  try{const period=new URL(request.url).searchParams.get("period");return NextResponse.json({data:await listPreinvoices(auth.db,{companyId:remainingCompanyScope(auth.context),period})});}
  catch(error){return remainingAuthorizationError(request,auth.context,error)||NextResponse.json({error:"No fue posible listar prefacturas.",code:"BILLING_LIST_FAILED"},{status:500});}
}
