import OperacionDetailClient from "@/components/operacion/OperacionDetailClient";

export const metadata = {
  title: "Detalle de operación | ParkFacil",
  description: "Detalle real de una estadía Off Street.",
};

export default async function OperacionDetallePage({ params }) {
  const { id } = await params;
  return <OperacionDetailClient id={id} />;
}
