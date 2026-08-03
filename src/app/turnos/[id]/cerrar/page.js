import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import ShiftClosureForm from "@/components/estacionamientos/ShiftClosureForm";
export default async function Page({params}){const {id}=await params;return <AppShell title="Cierre de turno" description="Operación On Street"><div className="mx-auto max-w-4xl space-y-5"><PageHeader title="Cierre de turno" description="Revise la información antes de confirmar el cierre definitivo."/><ShiftClosureForm shiftId={id}/></div></AppShell>;}
