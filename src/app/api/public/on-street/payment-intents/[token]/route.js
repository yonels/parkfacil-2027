import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { isPublicToken } from "@/lib/onStreetPilot.mjs";
import { getPublicPaymentIntent } from "@/lib/onStreetPaymentService";
const headers={"Cache-Control":"no-store"};
export async function GET(_request,{params}){const{token}=await params;if(!isPublicToken(token))return NextResponse.json({error:"Intención no encontrada."},{status:404,headers});try{const i=await getPublicPaymentIntent(getSupabaseAdminClient(),token);return i?NextResponse.json({data:{status:i.status,operationType:i.operation_type,minutes:i.purchased_minutes,amount:i.amount,currency:i.currency,location:i.location_snapshot,expiresAt:i.expires_at,paidAt:i.paid_at}},{headers}):NextResponse.json({error:"Intención no encontrada."},{status:404,headers});}catch{return NextResponse.json({error:"No fue posible consultar el pago."},{status:503,headers});}}
