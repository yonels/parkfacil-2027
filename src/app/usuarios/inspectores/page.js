import UsuariosPorRolClient from "@/components/usuarios/UsuariosPorRolClient";

export const metadata = {
  title: "Inspectores | ParkFacil 2027",
};

// Inspectores On Street propios de cada empresa (SOL-2026-11-16-003): mismo
// catálogo que administradores y operadores, perfil «Inspector».
export default function InspectoresPage() {
  return (
    <UsuariosPorRolClient
      rol="inspector"
      titulo="Inspectores"
      descripcion="Inspectores On Street de tu empresa. Fiscalizan todas las calles On Street de la empresa desde el portal Inspectores."
      placeholderBusqueda="Buscar inspectores"
      backHref="/usuarios"
      backLabel="Volver a Usuarios"
      roleLabel="inspector"
      showCredentials
    />
  );
}
