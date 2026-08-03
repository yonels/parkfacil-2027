import { StructureDetailRoute } from "@/components/estacionamientos/StructureRoute";
export default async function Page({ params }) { const { id, nivelId } = await params; return <StructureDetailRoute parkingId={id} kind="level" entityId={nivelId} />; }
