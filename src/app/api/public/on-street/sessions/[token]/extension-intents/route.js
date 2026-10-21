import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { isPublicToken } from "@/lib/onStreetPilot.mjs";
import { createExtensionPaymentIntent } from "@/lib/onStreetPaymentService";
import { clientFingerprint } from "@/lib/onStreetPilotRepository";
const headers={"Cache-Control":"no-store"};
export async function POST(request,{params}){const{token}=await params;if(!isPublicToken(token))return NextResponse.json({error:"Sesión no encontrada."},{status:404,headers});try{const body=await request.json(),idempotencyKey=String(request.headers.get("idempotency-key")||"");const intent=await createExtensionPaymentIntent(getSupabaseAdminClient(),{sessionToken:token,minutes:body.minutes,idempotencyKey,clientHash:clientFingerprint(request)});return NextResponse.json({data:{token:intent.public_token,status:intent.status,amount:intent.amount,currency:intent.currency,expiresAt:intent.expires_at}},{status:201,headers});}catch(error){return NextResponse.json({error:"No fue posible crear la extensión prepago.",code:error.code||error.message},{status:error.status||503,headers});}}
