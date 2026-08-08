import SeleccionarEstacionamientoTarifas from "@/components/tarifas/SeleccionarEstacionamientoTarifas";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { listParkings } from "@/lib/estacionamientosRepository";
import { getCurrentServerContext } from "@/lib/auth/currentServerContext";
import { assignedParkingIds } from "@/lib/auth/parkingAuthorization";
import { parkingQueryScope } from "@/lib/auth/parkingAuthorizationCore.mjs";

export const dynamic = "force-dynamic";

// Entrada de "Tarifas": Administración de tarifas de estacionamiento -> Seleccionar
// estacionamiento -> Minuto efectivo / Tramo vencido. Reutiliza el mismo alcance de
// autorización que /estacionamientos (un operador/company_admin solo ve lo suyo).
export default async function AdministracionTarifasPage() {
  let initialParkings = [];
  try {
    const db = getSupabaseAdminClient();
    const context = await getCurrentServerContext();
    const assigned = await assignedParkingIds(db, context);
    initialParkings = await listParkings(db, parkingQueryScope(context, assigned || []));
  } catch (error) {
    console.warn("[tarifas:administracion:fallback]", error?.code || error?.message || "connection_error");
  }
  return <SeleccionarEstacionamientoTarifas parkings={initialParkings} />;
}
