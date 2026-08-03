import { StructureFormRoute } from "@/components/estacionamientos/StructureRoute";
export default async function Page({ params }) { const { id } = await params; return <StructureFormRoute parkingId={id} kind="level" />; }
