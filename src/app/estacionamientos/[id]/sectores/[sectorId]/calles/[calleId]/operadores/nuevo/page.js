import { AssignmentRoute } from "@/components/estacionamientos/StructureRoute";
export default async function Page({ params }) { const { id, sectorId, calleId } = await params; return <AssignmentRoute parkingId={id} sectorId={sectorId} streetId={calleId} form />; }
