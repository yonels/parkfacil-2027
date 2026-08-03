import "server-only";
import { getDemoStructure } from "@/data/parkingStructureDemo.mjs";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { getParkingStructure } from "@/lib/parkingStructureRepository";

export async function getStructurePageData(parking) {
  try {
    return await getParkingStructure(getSupabaseAdminClient(), parking);
  } catch (error) {
    console.error("[parking:structure:fallback]", error?.code || error?.message || "connection_error");
    return getDemoStructure(parking);
  }
}
