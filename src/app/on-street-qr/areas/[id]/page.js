import OnStreetAreaDetail from "@/components/on-street-admin/OnStreetAreaDetail";

export const metadata = { title: "Área On Street | ParkFacil" };

export default async function Page({ params }) {
  const { id } = await params;
  return <OnStreetAreaDetail id={id} />;
}
