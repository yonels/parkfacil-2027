import { StructureFormRoute } from "@/components/estacionamientos/StructureRoute";
export default async function Page({ params }) { const { id, nivelId, zonaId } = await params; return <StructureFormRoute parkingId={id} kind="zone" parentId={nivelId} entityId={zonaId} />; }
