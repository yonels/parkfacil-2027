import OnStreetQrIndividualClient from "@/components/on-street-admin/OnStreetQrIndividualClient";

export const metadata = { title: "QR On Street | ParkFacil" };

export default async function Page({ params }) {
  const { id } = await params;
  return <OnStreetQrIndividualClient id={id} />;
}
