import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { getParking } from "@/lib/estacionamientosRepository";
import { getCurrentServerContext } from "@/lib/auth/currentServerContext";
import { assignedParkingIds } from "@/lib/auth/parkingAuthorization";
import { parkingQueryScope } from "@/lib/auth/parkingAuthorizationCore.mjs";

export async function getParkingPageData(identifier) {
  try {
    const context = await getCurrentServerContext();
    const db = getSupabaseAdminClient();
    const assigned = await assignedParkingIds(db, context);
    return await getParking(db, identifier, parkingQueryScope(context, assigned || []));
  } catch (error) {
    if (error?.status === 401 || error?.status === 403 || error?.status === 404) return null;
    console.error("[parking:page:fallback]", error?.code || error?.message || "connection_error");
    return null;
  }
}
