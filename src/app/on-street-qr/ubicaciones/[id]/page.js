import OnStreetLocationDetailClient from "@/components/on-street-admin/OnStreetLocationDetailClient";

export const metadata = { title: "Punto QR | ParkFacil" };

export default async function Page({ params }) {
  const { id } = await params;
  return <OnStreetLocationDetailClient id={id} />;
}
