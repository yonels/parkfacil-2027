import { NextResponse } from "next/server";
import { authorizeOnStreetAdminRequest, authorizeOnStreetAdminManageRequest } from "@/lib/onStreetAdminAuthorization";
import { createOnStreetQrLocation, listOnStreetLocations } from "@/lib/onStreetAdminRepository";
import { buildOnStreetQrLocationCreate } from "@/lib/onStreetQrLocationFormCore.mjs";
export async function GET(request){const auth=await authorizeOnStreetAdminRequest(request);if(auth.response)return auth.response;try{return NextResponse.json({data:await listOnStreetLocations(auth.db,auth.context)});}catch(error){console.error("[ON_STREET_ADMIN_LOCATIONS]",{code:error.code||error.message});return NextResponse.json({error:"No fue posible cargar las ubicaciones QR."},{status:503});}}

// Crea una ubicación QR nueva. El código público (qrCode) lo genera la base
// de datos (gen_random_uuid, sin guiones): impredecible, no secuencial, nunca
// se construye en el cliente.
export async function POST(request){
  const auth=await authorizeOnStreetAdminManageRequest(request);if(auth.response)return auth.response;
  let body;try{body=await request.json();}catch{return NextResponse.json({error:"Solicitud inválida."},{status:400});}
  const{errors,data}=buildOnStreetQrLocationCreate(body);
  if(errors.length)return NextResponse.json({error:errors[0],details:errors,code:"VALIDATION_ERROR"},{status:400});
  try{
    const location=await createOnStreetQrLocation(auth.db,auth.context,data);
    return NextResponse.json({data:location},{status:201});
  }catch(error){
    const map={PARKING_NOT_FOUND:{status:404,error:"No se encontró el estacionamiento indicado."},SEGMENT_ALREADY_HAS_QR:{status:409,error:"Ese tramo ya tiene una ubicación QR asignada."},QR_LOCATION_HIERARCHY_INVALID:{status:400,error:"El área, la calle y el tramo no corresponden al estacionamiento seleccionado."},RATE_NOT_FOUND_FOR_PARKING:{status:400,error:"La tarifa seleccionada no existe o no pertenece a este estacionamiento."}};
    const mapped=map[error.code];
    if(mapped)return NextResponse.json({error:mapped.error,code:error.code},{status:mapped.status});
    console.error("[ON_STREET_ADMIN_LOCATION_CREATE]",{code:error.code||error.message});
    return NextResponse.json({error:"No fue posible crear la ubicación QR."},{status:503});
  }
}
