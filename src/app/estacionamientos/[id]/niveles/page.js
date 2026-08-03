import { StructureListRoute } from "@/components/estacionamientos/StructureRoute";
export default async function Page({ params }) { const { id } = await params; return <StructureListRoute parkingId={id} kind="level" />; }
