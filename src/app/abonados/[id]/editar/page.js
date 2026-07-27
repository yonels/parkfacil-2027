import AbonadoEditorClient from "@/components/abonados/AbonadoEditorClient";

export const metadata = {
  title: "Editar abonado | ParkFacil",
  description: "Edición de un abonado con persistencia en Supabase.",
};

export default async function EditarAbonadoPage({ params }) {
  const resolvedParams = await params;
  return <AbonadoEditorClient mode="edit" abonadoId={resolvedParams.id} />;
}