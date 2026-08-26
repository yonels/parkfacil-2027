import UsuariosPorRolClient from "@/components/usuarios/UsuariosPorRolClient";

export const metadata = {
  title: "Administradores On Street | ParkFacil 2027",
};

// Reutiliza el mismo componente que /usuarios/administradores (mismas
// tablas, autenticación, roles, permisos y API /api/usuarios) — solo
// acota el listado y el selector de creación a empresas con operación
// On Street (/api/on-street-qr/companies, ya aislado por empresa
// server-side) y agrega el botón "Crear".
export default function OnStreetAdministradoresPage() {
  return (
    <UsuariosPorRolClient
      rol="company_admin"
      titulo="Administradores On Street"
      descripcion="Administradores de empresas con operación On Street. Haz clic en un administrador para abrir directamente su administración."
      placeholderBusqueda="Buscar administradores"
      backHref="/on-street-qr"
      backLabel="Volver a On Street"
      crear
      roleLabel="administrador"
      empresasEndpoint="/api/on-street-qr/companies"
    />
  );
}
