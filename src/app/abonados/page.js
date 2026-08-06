import AbonadosClient from "./AbonadosClient";
import { getCurrentServerContext } from "@/lib/auth/currentServerContext";
import { assignedParkingIds } from "@/lib/auth/parkingAuthorization";
import { subscriberQueryScope } from "@/lib/auth/subscriberAuthorizationCore.mjs";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { fetchAbonadosBundle } from "@/lib/abonadosRepository";

export const metadata = {
  title: "Abonados y Credenciales | ParkFacil",
  description: "Vista base de abonados, vehículos, credenciales y permisos de acceso.",
};

export default async function AbonadosPage() {
  const context = await getCurrentServerContext();
  const db = getSupabaseAdminClient();
  const assigned = await assignedParkingIds(db, context);
  const scope = subscriberQueryScope(context, assigned || []);
  const result = await fetchAbonadosBundle(db, { page: 1, limit: 100, sort: "codigo", direction: "asc" }, scope);
  return <AbonadosClient initialAbonados={result.data} canManage={context.role !== "operator"} />;
}
