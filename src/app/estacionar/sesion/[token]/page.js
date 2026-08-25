import PublicParkingSession from "@/components/on-street/PublicParkingSession";
export const dynamic="force-dynamic";export const metadata={title:"Tu estacionamiento | ParkFacil",robots:{index:false,follow:false}};
export default async function Page({params}){const{token}=await params;return <PublicParkingSession token={token}/>}
