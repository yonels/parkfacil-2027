import { NextResponse } from "next/server";
import { authorizeOnStreetAdminRequest } from "@/lib/onStreetAdminAuthorization";
import { getOnStreetSessionDetail } from "@/lib/onStreetAdminRepository";
export async function GET(request,{params}){const auth=await authorizeOnStreetAdminRequest(request);if(auth.response)return auth.response;try{const {id}=await params,data=await getOnStreetSessionDetail(auth.db,auth.context,id);return data?NextResponse.json({data}):NextResponse.json({error:"Sesión no encontrada."},{status:404});}catch(error){console.error("[ON_STREET_ADMIN_SESSION]",{code:error.code||error.message});return NextResponse.json({error:"No fue posible cargar la sesión."},{status:503});}}
