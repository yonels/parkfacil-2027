import PublicParkingStart from "@/components/on-street/PublicParkingStart";
import { isPublicCode } from "@/lib/onStreetPilot.mjs";
import { getPublicQrLocation } from "@/lib/onStreetPilotRepository";
export const dynamic = "force-dynamic";
export const metadata = { title: "Estacionar | ParkFacil", robots: { index: false, follow: false } };
export default async function Page({ params }) {
  const { qrCode } = await params;
  // getPublicQrLocation distingue "no existe" (devuelve null) de una falla real
  // de infraestructura (lanza el error de Supabase). Antes, un catch(() => null)
  // colapsaba ambos casos en el mismo "Código QR no válido" sin dejar rastro en
  // logs -- una caída real de la base de datos se veía exactamente igual que un
  // código inexistente, y el conductor recibía un mensaje que sugiere que el
  // sticker físico está roto en vez de "el servicio no está disponible ahora".
  let result = null, serviceUnavailable = false;
  if (isPublicCode(qrCode)) {
    try { result = await getPublicQrLocation(qrCode); }
    catch (error) { serviceUnavailable = true; console.error("[ON_STREET_QR_LANDING]", { qrCode, code: error?.code || error?.message }); }
  }
  if (serviceUnavailable) return <main className="grid min-h-dvh place-items-center bg-[#EEF4FF] p-4"><section className="max-w-md rounded-3xl bg-white p-8 text-center"><p className="font-black text-[#3150D8]">ParkFacil</p><h1 className="mt-2 text-2xl font-black text-[#041E42]">Servicio no disponible</h1><p className="mt-3 text-slate-600">No pudimos validar este código en este momento. Intenta nuevamente en unos segundos.</p></section></main>;
  if (!result) return <main className="grid min-h-dvh place-items-center bg-[#EEF4FF] p-4"><section className="max-w-md rounded-3xl bg-white p-8 text-center"><p className="font-black text-[#3150D8]">ParkFacil</p><h1 className="mt-2 text-2xl font-black text-[#041E42]">Código QR no válido</h1><p className="mt-3 text-slate-600">Este código no existe, está inactivo o no corresponde a un tramo disponible.</p></section></main>;
  if (!result.rate) return <main className="grid min-h-dvh place-items-center bg-[#EEF4FF] p-4"><section className="max-w-md rounded-3xl bg-white p-8 text-center"><p className="font-black text-[#3150D8]">ParkFacil</p><h1 className="mt-2 text-2xl font-black text-[#041E42]">Estacionamiento no disponible</h1><p className="mt-3 text-slate-600">No existe una tarifa por minuto vigente para esta ubicación. Contacta al operador.</p></section></main>;
  const location = { parkingName: result.parking.name, sectorName: result.sector.name, streetName: result.street.name, segmentName: result.segment.name, operator: { tradeName: result.company?.trade_name || result.company?.business_name, businessName: result.company?.business_name, rut: result.company?.rut_number ? `${result.company.rut_number}-${result.company.rut_dv}` : null, email: result.company?.email, phone: result.company?.phone }, ratePerMinute: Number(result.rate.minute_amount) };
  return <PublicParkingStart qrCode={qrCode} location={location}/>;
}
