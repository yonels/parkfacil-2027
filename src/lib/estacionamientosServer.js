import "server-only";
import { getEstacionamientoById } from "@/data/estacionamientos.mjs";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { getParking } from "@/lib/estacionamientosRepository";

export async function getParkingPageData(identifier) {
  try {
    return await getParking(getSupabaseAdminClient(), identifier);
  } catch (error) {
    console.error("[parking:page:fallback]", error?.code || error?.message || "connection_error");
    return getEstacionamientoById(identifier);
  }
}
