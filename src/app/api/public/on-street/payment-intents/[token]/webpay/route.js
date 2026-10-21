import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { isPublicToken } from "@/lib/onStreetPilot.mjs";
import { startWebpayPayment } from "@/lib/onStreetPaymentService";
import { resolveOnStreetPublicOrigin } from "@/lib/onStreetPublicOrigin.mjs";
const headers={"Cache-Control":"no-store"};
export async function POST(request,{params}){const{token}=await params;if(!isPublicToken(token))return NextResponse.json({error:"Intención no encontrada."},{status:404,headers});try{const idempotencyKey=String(request.headers.get("idempotency-key")||"");if(idempotencyKey.length<8)return NextResponse.json({error:"Falta clave de idempotencia."},{status:400,headers});const origin=resolveOnStreetPublicOrigin({requestOrigin:new URL(request.url).origin});const data=await startWebpayPayment(getSupabaseAdminClient(),{intentToken:token,idempotencyKey,returnUrl:`${origin}/api/public/on-street/webpay/return`});return NextResponse.json({data},{headers});}catch(error){return NextResponse.json({error:"No fue posible iniciar Webpay.",code:error.code||error.message},{status:error.status||503,headers});}}
