import { NextResponse } from "next/server";
import { isInternalServiceKeyValid } from "@/lib/internalServiceAuth.mjs";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { recoverWebpayTransaction } from "@/lib/onStreetPaymentService";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function POST(request,{params}){const sent=request.headers.get("x-parkfacil-service-key"),expected=process.env.PARKFACIL_INTERNAL_SERVICE_KEY;if(!isInternalServiceKeyValid(sent,expected))return NextResponse.json({error:"No autorizado."},{status:401});const{id}=await params;if(!uuid.test(id))return NextResponse.json({error:"Transacción inválida."},{status:400});try{return NextResponse.json({data:await recoverWebpayTransaction(getSupabaseAdminClient(),{transactionId:id})},{headers:{"Cache-Control":"no-store"}})}catch(error){console.error("[ON_STREET_WEBPAY_RECOVERY]",{code:error.code||error.message||"RECOVERY_FAILED"});return NextResponse.json({error:"No fue posible recuperar la transacción.",code:error.code||"RECOVERY_FAILED"},{status:error.status||503})}}
