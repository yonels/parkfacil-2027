import OnStreetStreetCreate from "@/components/on-street-admin/OnStreetStreetCreate";

// Nueva Calle 100% On Street (2026-08-28): antes redirigía a
// /estacionamientos/.../calles/nueva para completar el formulario -- ahora
// todo el flujo (elegir estacionamiento/área si falta, completar, guardar)
// ocurre dentro de /on-street-qr, reutilizando el mismo formulario real
// existente (StructureEntityForm, kind="street") sin salir del árbol On
// Street. Ver OnStreetStreetCreate.js.
//
// parkingId/areaId (§3 de la auditoría de fichas On Street 2026-08-28):
// cuando se llega aquí desde "+ Nueva calle" en la ficha de un Área
// (OnStreetAreaDetail.js), la jerarquía ya conocida se precarga y no se
// vuelve a pedir.
export const metadata = { title: "Nueva calle On Street | ParkFacil" };

export default async function Page({ searchParams }) {
  const params = await searchParams;
  const initialParkingId = typeof params?.parkingId === "string" ? params.parkingId : "";
  const initialSectorId = typeof params?.areaId === "string" ? params.areaId : "";
  return <OnStreetStreetCreate initialParkingId={initialParkingId} initialSectorId={initialSectorId} />;
}
