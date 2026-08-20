import UsuariosPorRolClient from "@/components/usuarios/UsuariosPorRolClient";

export const metadata = {
  title: "Administradores | ParkFacil 2027",
};

export default function AdministradoresPage() {
  return (
    <UsuariosPorRolClient
      rol="company_admin"
      titulo="Administradores"
      descripcion="Administradores de empresa de todos los clientes. Haz clic en un administrador para abrir directamente su administración."
      placeholderBusqueda="Buscar administradores"
      backHref="/usuarios"
      backLabel="Volver a Usuarios"
    />
  );
}
