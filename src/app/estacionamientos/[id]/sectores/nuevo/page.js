import { StructureFormRoute } from "@/components/estacionamientos/StructureRoute";

export default async function NuevoSectorPage({ params, searchParams }) {
  const { id } = await params;
  return <StructureFormRoute parkingId={id} kind="sector" />;
}
