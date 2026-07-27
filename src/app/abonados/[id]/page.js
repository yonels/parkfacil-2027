import AbonadoDetalleClient from "@/components/abonados/AbonadoDetalleClient";

export const metadata = {
  title: "Detalle de abonado | ParkFacil",
  description: "Detalle visual de un abonado y sus credenciales.",
};

export default async function AbonadoDetallePage({ params }) {
  const resolvedParams = await params;
  return <AbonadoDetalleClient abonadoId={resolvedParams.id} />;
}