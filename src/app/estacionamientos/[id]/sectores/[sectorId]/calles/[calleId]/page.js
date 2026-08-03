import { StructureDetailRoute } from "@/components/estacionamientos/StructureRoute";
export default async function Page({ params }) { const { id, sectorId, calleId } = await params; return <StructureDetailRoute parkingId={id} kind="street" parentId={sectorId} entityId={calleId} />; }
