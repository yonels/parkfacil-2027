import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabaseAuthServer";
import { getPersistedClosure } from "@/lib/shiftClosureRepository";
import { canViewClosure } from "@/lib/shiftClosure.mjs";
export async function GET(request,{params}){try{const actor=await authenticateRequest(request);if(!actor)return NextResponse.json({error:"Debes iniciar sesión.",code:"AUTH_REQUIRED"},{status:401});const {id}=await params;const closure=await getPersistedClosure(id);if(!closure)return NextResponse.json({error:"Comprobante no encontrado.",code:"CLOSURE_NOT_FOUND"},{status:404});if(!canViewClosure(actor,closure))return NextResponse.json({error:"No tienes autorización para ver este comprobante.",code:"CLOSURE_FORBIDDEN"},{status:403});return NextResponse.json({data:closure});}catch(error){console.error("[shift:receipt]",error);return NextResponse.json({error:"No fue posible obtener el comprobante.",code:"CLOSURE_READ_FAILED"},{status:500});}}
