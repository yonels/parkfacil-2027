import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import ParkingShiftsManager from "@/components/estacionamientos/ParkingShiftsManager";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { getCurrentServerContext } from "@/lib/auth/currentServerContext";
import { assignedParkingIds } from "@/lib/auth/parkingAuthorization";
import { parkingQueryScope } from "@/lib/auth/parkingAuthorizationCore.mjs";
import { getParking, listParkings } from "@/lib/estacionamientosRepository";
import { getStructurePageData } from "@/lib/parkingStructureServer";

export const dynamic = "force-dynamic";

export default async function TurnosPage({ searchParams }) {
  const query = await searchParams;
  const selected = String(query?.estacionamiento || "").trim();

  let parkings = [];
  let parking = null;
  let structure = null;

  try {
    const db = getSupabaseAdminClient();
    const context = await getCurrentServerContext();
    const assigned = await assignedParkingIds(db, context);
    const scope = parkingQueryScope(context, assigned || []);
    parkings = await listParkings(db, scope);
    const fallbackId = parkings[0]?.code || "";
    parking = selected ? await getParking(db, selected, scope) : (fallbackId ? await getParking(db, fallbackId, scope) : null);
    structure = parking ? await getStructurePageData(parking) : null;
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
              <form className="mt-2">
                <select
                  name="estacionamiento"
                  defaultValue={parking?.code || ""}
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]"
                  onChange={(event) => event.currentTarget.form?.requestSubmit()}
                >
                  {parkings.map((item) => (
                    <option key={item.id} value={item.code}>{item.name} ({item.code})</option>
                  ))}
                </select>
              </form>
            </div>
            {parking ? (
              <Link href={`/estacionamientos/${parking.code}/turnos`} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-[#3150D8] hover:border-[#3150D8]">
                Abrir vista por estacionamiento
              </Link>
            ) : null}
          </div>
        </section>

        {parking ? (
          <ParkingShiftsManager parking={parking} structure={structure} />
        ) : (
          <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
            No hay estacionamientos disponibles para gestionar turnos.
          </section>
        )}
      </div>
    </AppShell>
  );
}
