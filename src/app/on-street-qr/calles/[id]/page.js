import OnStreetStreetDetail from "@/components/on-street-admin/OnStreetStreetDetail";

export const metadata = { title: "Calle On Street | ParkFacil" };

export default async function Page({ params }) {
  const { id } = await params;
  return <OnStreetStreetDetail id={id} />;
}
