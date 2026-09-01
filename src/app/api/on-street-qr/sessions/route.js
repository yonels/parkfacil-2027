import { NextResponse } from "next/server";
import { authorizeOnStreetAdminRequest } from "@/lib/onStreetAdminAuthorization";
import { listOnStreetSessionsPage } from "@/lib/onStreetAdminRepository";
// Paginación real server-side (§ corrección "eliminar límite de 1000"
// 2026-08-28): listOnStreetSessionsPage pide a Postgres COUNT+.range() ya
// filtrado -- nunca trae el universo completo a Node. Ver
// onStreetAdminRepository.js para el detalle.
export async function GET(request){const auth=await authorizeOnStreetAdminRequest(request);if(auth.response)return auth.response;try{return NextResponse.json({data:await listOnStreetSessionsPage(auth.db,auth.context,Object.fromEntries(new URL(request.url).searchParams))});}catch(error){console.error("[ON_STREET_ADMIN_SESSIONS]",{code:error.code||error.message});return NextResponse.json({error:"No fue posible cargar las sesiones."},{status:503});}}
