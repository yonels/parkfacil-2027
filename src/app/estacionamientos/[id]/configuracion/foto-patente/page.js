import AppShell from "@/components/layout/AppShell";
import PlatePhotoSettings from "@/components/estacionamientos/PlatePhotoSettings";

export default async function FotoPatenteConfiguracionPage({ params }) {
  const { id } = await params;
  return (
    <AppShell title="Operación de entrada" description="Off Street · Fotografía de patente">
      <PlatePhotoSettings parkingId={id} />
    </AppShell>
  );
}
