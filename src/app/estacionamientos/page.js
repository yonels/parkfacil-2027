import EstacionamientosAdminClient from "@/components/estacionamientos/EstacionamientosAdminClient";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { listCompanies } from "@/lib/companiesRepository";
import { listParkings } from "@/lib/estacionamientosRepository";
import { getCurrentServerContext } from "@/lib/auth/currentServerContext";
import { assignedParkingIds } from "@/lib/auth/parkingAuthorization";
import { parkingQueryScope } from "@/lib/auth/parkingAuthorizationCore.mjs";
import { companyScope } from "@/lib/auth/apiAuthorizationCore.mjs";

export const dynamic = "force-dynamic";

export default async function EstacionamientosPage({ searchParams }) {
  const query = await searchParams;
  const initialType = ["ON_STREET", "OFF_STREET"].includes(query?.tipo) ? query.tipo : "ALL";
  let initialParkings = [];
  let initialCompanies = [];
  try {
    const db = getSupabaseAdminClient();
    const context = await getCurrentServerContext();
    const assigned = await assignedParkingIds(db, context);
    [initialParkings, initialCompanies] = await Promise.all([
      listParkings(db, parkingQueryScope(context, assigned || [])),
      listCompanies(db, { companyId: companyScope(context) }),
    ]);
  } catch (error) {
    console.warn("[parking:initial-load:fallback]", error?.code || error?.message || "connection_error");
  }
  return <EstacionamientosAdminClient initialParkings={initialParkings} initialCompanies={initialCompanies} initialType={initialType} />;
}
