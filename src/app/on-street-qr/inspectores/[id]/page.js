import OnStreetInspectorDetail from "@/components/on-street-admin/OnStreetInspectorDetail";

export const metadata = { title: "Inspector On Street | ParkFacil" };

export default async function Page({ params }) {
  const { id } = await params;
  return <OnStreetInspectorDetail id={id} />;
}
