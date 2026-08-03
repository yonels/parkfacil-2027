import ShiftClosureReceipt from "@/components/estacionamientos/ShiftClosureReceipt";
export default async function Page({params}){const {id}=await params;return <main className="min-h-screen bg-slate-100 p-4 sm:p-8"><ShiftClosureReceipt closureId={id}/></main>;}
