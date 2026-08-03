import EstacionamientosAdminClient from "@/components/estacionamientos/EstacionamientosAdminClient";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { listCompanies } from "@/lib/companiesRepository";
import { listParkings } from "@/lib/estacionamientosRepository";

export const dynamic = "force-dynamic";

export default async function EstacionamientosPage({ searchParams }) {
  const query = await searchParams;
  const initialType = ["ON_STREET", "OFF_STREET"].includes(query?.tipo) ? query.tipo : "ALL";
  let initialParkings = [];
  let initialCompanies = [];
  try {
    const db = getSupabaseAdminClient();
    [initialParkings, initialCompanies] = await Promise.all([
      listParkings(db),
      listCompanies(db),
    ]);
  } catch (error) {
    console.warn("[parking:initial-load:fallback]", error?.code || error?.message || "connection_error");
  }
  return <EstacionamientosAdminClient initialParkings={initialParkings} initialCompanies={initialCompanies} initialType={initialType} />;
}
