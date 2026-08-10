import { NextResponse } from "next/server";
import { authorizeRemainingRequest, remainingAuthorizationError, remainingCompanyScope } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { getPreinvoice } from "@/lib/billing/preinvoiceRepository";

export async function GET(request,{params}){
  const auth=await authorizeRemainingRequest(request,PERMISSIONS.BILLING_READ);if(auth.response)return auth.response;
  try{const {id}=await params;const data=await getPreinvoice(auth.db,id,remainingCompanyScope(auth.context));return data?NextResponse.json({data}):NextResponse.json({error:"Prefactura no encontrada.",code:"RESOURCE_NOT_FOUND"},{status:404});}
  catch(error){return remainingAuthorizationError(request,auth.context,error)||NextResponse.json({error:"No fue posible obtener la prefactura.",code:"BILLING_READ_FAILED"},{status:500});}
}
