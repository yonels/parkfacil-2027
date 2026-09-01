import OnStreetProjectDetail from "@/components/on-street-admin/OnStreetProjectDetail";

export const metadata = { title: "Proyecto On Street | ParkFacil" };

export default async function Page({ params }) {
  const { id } = await params;
  return <OnStreetProjectDetail id={id} />;
}
