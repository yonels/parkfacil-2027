import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import OnStreetQuickCreate from "@/components/on-street-admin/OnStreetQuickCreate";

// Acceso directo (solo Root — ver ROOT_ONLY_PREFIXES en permissions.mjs)
// para crear un nuevo Tramo On Street sin recorrer manualmente
// /estacionamientos → sectores → calles → calle. Lleva a la ficha real de
// la calle, donde StreetSegmentsManager (única fuente de verdad para
// tramos) ya expone el botón "Crear tramo".
export default function Page() {
  return (
    <AppShell title="Crear tramo On Street" description="Acceso directo — Tramo">
      <div className="space-y-6">
        <PageHeader title="Crear tramo" description="Selecciona el estacionamiento, el área y la calle On Street." backToHistory backLabel="Volver" />
        <OnStreetQuickCreate kind="segment" />
      </div>
    </AppShell>
  );
}
