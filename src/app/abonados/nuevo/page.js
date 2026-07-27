import AbonadoEditorClient from "@/components/abonados/AbonadoEditorClient";

export const metadata = {
  title: "Nuevo abonado | ParkFacil",
  description: "Creación de un nuevo abonado con persistencia en Supabase.",
};

export default function NuevoAbonadoPage() {
  return <AbonadoEditorClient mode="create" />;
}