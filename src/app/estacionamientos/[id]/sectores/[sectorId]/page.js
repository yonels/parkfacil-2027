import { StructureDetailRoute } from "@/components/estacionamientos/StructureRoute";
export default async function Page({ params }) { const { id, sectorId } = await params; return <StructureDetailRoute parkingId={id} kind="sector" entityId={sectorId} />; }
