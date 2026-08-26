import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import OnStreetQuickCreate from "@/components/on-street-admin/OnStreetQuickCreate";

// Acceso directo (solo Root — ver ROOT_ONLY_PREFIXES en permissions.mjs)
// para crear una nueva Calle On Street sin recorrer manualmente
// /estacionamientos → sectores → calles. Reutiliza el formulario real
// existente (StructureEntityForm, kind="street") vía redirección.
export default function Page() {
  return (
    <AppShell title="Crear calle On Street" description="Acceso directo — Calle">
      <div className="space-y-6">
        <PageHeader title="Crear calle" description="Selecciona el estacionamiento y el área On Street." backHref="/on-street-qr" backLabel="Volver a On Street" />
        <OnStreetQuickCreate kind="street" />
      </div>
    </AppShell>
  );
}
