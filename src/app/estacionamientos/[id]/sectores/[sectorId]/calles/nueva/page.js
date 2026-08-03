import { StructureFormRoute } from "@/components/estacionamientos/StructureRoute";
export default async function Page({ params }) { const { id, sectorId } = await params; return <StructureFormRoute parkingId={id} kind="street" parentId={sectorId} />; }
