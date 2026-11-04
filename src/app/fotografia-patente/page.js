import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import PlatePhotoSettings from "@/components/estacionamientos/PlatePhotoSettings";
import TurnosParkingSelect from "@/components/estacionamientos/TurnosParkingSelect";
import { getCurrentServerContext } from "@/lib/auth/currentServerContext";
import { assignedParkingIds } from "@/lib/auth/parkingAuthorization";
import { parkingQueryScope } from "@/lib/auth/parkingAuthorizationCore.mjs";
import { listParkings } from "@/lib/estacionamientosRepository";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { offStreetShiftParkings, pickShiftParking } from "@/lib/turnosParkingCore.mjs";

export const dynamic = "force-dynamic";

// Off Street → Estacionamientos → Fotografía de patente (SOL-2026-11-04-007): la misma
// configuración de la ficha, con selector, porque el menú no conoce el estacionamiento.
export default async function FotografiaPatentePage({ searchParams }) {
  const query = await searchParams;
  let parkings = [];
  let selectedParking = null;
  try {
    const db = getSupabaseAdminClient();
    const context = await getCurrentServerContext();
    const assigned = await assignedParkingIds(db, context);
    parkings = offStreetShiftParkings(await listParkings(db, parkingQueryScope(context, assigned || [])));
    selectedParking = pickShiftParking(parkings, String(query?.estacionamiento || "").trim());
  } catch (error) {
    console.error("[fotografia-patente:page]", error?.code || error?.message || "load_failed");
  }

  return (
    <AppShell title="Fotografía de patente" description="Off Street · Operación de entrada">
      <div className="space-y-6">
        <PageHeader title="Fotografía de patente" description="Define por estacionamiento si el POS pide la foto de la patente al registrar un ingreso." />
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-[#041E42]">Estacionamiento</p>
          <TurnosParkingSelect
            basePath="/fotografia-patente"
            parkings={parkings.map((item) => ({ code: item.code, label: `${item.name} (${item.code})${item.status === "ACTIVE" ? "" : " · inactivo"}` }))}
            selectedCode={selectedParking?.code || ""}
          />
        </section>
        {selectedParking
          ? <PlatePhotoSettings key={selectedParking.code} parkingId={selectedParking.code} />
          : <p className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">No hay estacionamientos Off Street disponibles.</p>}
      </div>
    </AppShell>
  );
}
