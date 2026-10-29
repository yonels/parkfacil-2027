import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import ParkingShiftsManager from "@/components/estacionamientos/ParkingShiftsManager";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { getCurrentServerContext } from "@/lib/auth/currentServerContext";
import { assignedParkingIds } from "@/lib/auth/parkingAuthorization";
import { parkingQueryScope } from "@/lib/auth/parkingAuthorizationCore.mjs";
import { listParkings } from "@/lib/estacionamientosRepository";
import TurnosParkingSelect from "@/components/estacionamientos/TurnosParkingSelect";
import { offStreetShiftParkings, pickShiftParking } from "@/lib/turnosParkingCore.mjs";
import { getStructurePageData } from "@/lib/parkingStructureServer";

export const dynamic = "force-dynamic";

export default async function TurnosPage({ searchParams }) {
  const query = await searchParams;
  const selected = String(query?.estacionamiento || "").trim();

  let parkings = [];
  let selectedParking = null;
  let structure = null;

  try {
    const db = getSupabaseAdminClient();
    const context = await getCurrentServerContext();
    const assigned = await assignedParkingIds(db, context);
    const scope = parkingQueryScope(context, assigned || []);
    // Off Street → Operación → Turnos (SOL-2026-10-29-005): solo estacionamientos
    // Off Street, activos primero. Los turnos On Street siguen en la ficha de su
    // estacionamiento (/estacionamientos/<código>/turnos).
    parkings = offStreetShiftParkings(await listParkings(db, scope));
    selectedParking = pickShiftParking(parkings, selected);
    structure = selectedParking ? await getStructurePageData(selectedParking) : null;
  } catch (error) {
    console.error("[turnos:page]", error?.code || error?.message || "load_failed");
  }

  return (
    <AppShell title="Turnos" description="Gestión operacional de turnos">
      <div className="space-y-6">
        <PageHeader title="Turnos" description="Crear, editar, modificar y eliminar turnos por estacionamiento." />

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[260px] flex-1">
              <p className="text-sm font-semibold text-[#041E42]">Estacionamiento</p>
              <p className="mt-1 text-xs text-slate-500">Selecciona el estacionamiento para administrar turnos.</p>
              <TurnosParkingSelect
                parkings={parkings.map((item) => ({ code: item.code, label: `${item.name} (${item.code})${item.status === "ACTIVE" ? "" : " · inactivo"}` }))}
                selectedCode={selectedParking?.code || ""}
              />
            </div>
            {selectedParking ? <Link href={`/estacionamientos/${selectedParking.code}/configuracion/reglas-turnos`} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-[#3150D8] hover:border-[#3150D8]">Reglas de turnos</Link> : null}
            {selectedParking ? <Link href={`/estacionamientos/${selectedParking.code}/turnos`} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-[#3150D8] hover:border-[#3150D8]">Administrar turnos seleccionados</Link> : null}
          </div>
        </section>

        {selectedParking ? (
          <ParkingShiftsManager parking={selectedParking} structure={structure} />
        ) : (
          <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
            No hay estacionamientos Off Street disponibles para gestionar turnos.
          </section>
        )}
      </div>
    </AppShell>
  );
}
