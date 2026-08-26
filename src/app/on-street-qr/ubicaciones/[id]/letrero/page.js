import OnStreetSignageClient from "@/components/on-street-admin/OnStreetSignageClient";

export const metadata = { title: "Letrero On Street | ParkFacil" };

export default async function Page({ params }) {
  const { id } = await params;
  return <OnStreetSignageClient id={id} />;
}
