import CouponsClient from "@/components/cupones/CouponsClient";

export const metadata = {
  title: "Crear cupones | ParkFacil",
  description: "Emisión de cupones de descuento de un solo uso.",
};

export default function CrearCuponesPage() {
  return <CouponsClient mode="crear" />;
}
