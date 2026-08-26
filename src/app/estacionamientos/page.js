import EstacionamientosAdminClient from "@/components/estacionamientos/EstacionamientosAdminClient";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { listCompanies } from "@/lib/companiesRepository";
import { listParkings } from "@/lib/estacionamientosRepository";
import { getCurrentServerContext } from "@/lib/auth/currentServerContext";
import { assignedParkingIds } from "@/lib/auth/parkingAuthorization";
import { parkingQueryScope } from "@/lib/auth/parkingAuthorizationCore.mjs";
import { companyScope } from "@/lib/auth/apiAuthorizationCore.mjs";

export const dynamic = "force-dynamic";

// IMPORTANTE -- NO agregar un loading.js para esta ruta.
// Causa raíz confirmada de un bug real (Sidebar vacío tras F5/URL directa,
// solo para company_admin con AMBOS productos habilitados -- ver auditoría
// de acceso por producto): esta era la ÚNICA ruta de toda la app con un
// `loading.js`, lo que envuelve a este segmento (y por lo tanto a
// <AppShell>/<Sidebar>, que vive dentro de EstacionamientosAdminClient) en
// un boundary de Suspense con streaming SSR. Cuando la consulta server-side
// tarda lo suficiente para activar el streaming (más probable con más datos,
// p. ej. una empresa con ambos productos), Next revela el contenido real
// reemplazando el fallback fuera del ciclo normal de hidratación de React,
// y el useEffect de AppShell que resuelve la sesión (fuente de verdad de
// habilidades/enabled_products del Sidebar) nunca llega a ejecutarse --
// Sidebar queda permanentemente vacío, sin ningún error en consola.
// Ninguna otra ruta de /src/app tiene loading.js; esta página, al no
// tenerlo tampoco, vuelve a renderizar de forma síncrona igual que el resto
// -- consistente, no un parche. Si se necesita un estado de carga para esta
// ruta en el futuro, resolver la sesión ANTES del Suspense boundary (o
// mover AppShell fuera del árbol que Suspense puede diferir), no solo
// reintroducir loading.js.

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
