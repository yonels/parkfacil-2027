import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { createInitialPaymentIntent } from "@/lib/onStreetPaymentService";
import { clientFingerprint } from "@/lib/onStreetPilotRepository";
const headers={"Cache-Control":"no-store"};
export async function POST(request){try{const body=await request.json(),idempotencyKey=String(request.headers.get("idempotency-key")||"");if(body.accepted!==true)return NextResponse.json({error:"Debes aceptar las condiciones."},{status:400,headers});const intent=await createInitialPaymentIntent(getSupabaseAdminClient(),{qrCode:body.qrCode,licensePlate:body.licensePlate,phone:body.phone,minutes:body.minutes,idempotencyKey,clientHash:clientFingerprint(request)});return NextResponse.json({data:{token:intent.public_token,status:intent.status,amount:intent.amount,currency:intent.currency,expiresAt:intent.expires_at}},{status:201,headers});}catch(error){return NextResponse.json({error:"No fue posible crear la intención de pago.",code:error.code||error.message},{status:error.status||503,headers});}}
