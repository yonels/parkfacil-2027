import { NextResponse } from "next/server";
import { isPublicCode } from "@/lib/onStreetPilot.mjs";
import { getPublicQrLocation } from "@/lib/onStreetPilotRepository";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET(_request, { params }) {
  const { qrCode } = await params;
  if (!isPublicCode(qrCode)) return NextResponse.json({ error: "Código QR inválido." }, { status: 404, headers });
  try {
    const location = await getPublicQrLocation(qrCode);
    if (!location) return NextResponse.json({ error: "Este código QR no existe o no está activo." }, { status: 404, headers });
    if(!location.rate)return NextResponse.json({error:"No existe una tarifa por minuto vigente para esta ubicación."},{status:409,headers});
    return NextResponse.json({ data: { parkingName: location.parking.name, sectorName: location.sector.name, streetName: location.street.name, segmentName: location.segment.name, operator:{tradeName:location.company?.trade_name||location.company?.business_name,businessName:location.company?.business_name,rut:location.company?.rut_number?`${location.company.rut_number}-${location.company.rut_dv}`:null,email:location.company?.email},ratePerMinute:Number(location.rate.minute_amount),currency:location.rate.currency } }, { headers });
  } catch { return NextResponse.json({ error: "No fue posible consultar la ubicación." }, { status: 503, headers }); }
}
