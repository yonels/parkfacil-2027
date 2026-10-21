import CouponsClient from "@/components/cupones/CouponsClient";

export const metadata = {
  title: "Eliminar cupones | ParkFacil",
  description: "Eliminación de cupones de descuento no utilizados.",
};

export default function EliminarCuponesPage() {
  return <CouponsClient mode="eliminar" />;
}
