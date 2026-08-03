import { StructureFormRoute } from "@/components/estacionamientos/StructureRoute";

export default async function EditarSectorPage({ params }) {
  const { id, sectorId } = await params;
  return <StructureFormRoute parkingId={id} kind="sector" entityId={sectorId} />;
}
