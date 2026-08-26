import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import OnStreetQuickCreate from "@/components/on-street-admin/OnStreetQuickCreate";

// Acceso directo (solo Root — ver ROOT_ONLY_PREFIXES en permissions.mjs)
// para crear una nueva Área On Street sin recorrer manualmente
// /estacionamientos → sectores. Reutiliza el formulario real existente
// (StructureEntityForm, kind="sector") vía redirección.
export default function Page() {
  return (
    <AppShell title="Crear área On Street" description="Acceso directo — Área">
      <div className="space-y-6">
        <PageHeader title="Crear área" description="Selecciona el estacionamiento On Street." backHref="/on-street-qr" backLabel="Volver a On Street" />
        <OnStreetQuickCreate kind="area" />
      </div>
    </AppShell>
  );
}
