import AppShell from "@/components/layout/AppShell";
import OnStreetAdminNav from "@/components/on-street-admin/OnStreetAdminNav";
import OnStreetSessionDetail from "@/components/on-street-admin/OnStreetSessionDetail";
export default async function Page({params}){const{id}=await params;return <AppShell title="Detalle de sesión On Street QR" description="Información operacional sanitizada"><OnStreetAdminNav/><OnStreetSessionDetail id={id}/></AppShell>}
