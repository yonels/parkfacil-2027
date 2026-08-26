import UsuariosPorRolClient from "@/components/usuarios/UsuariosPorRolClient";

export const metadata = {
  title: "Operadores On Street | ParkFacil 2027",
};

// Reutiliza el mismo componente que /usuarios/operadores (mismas tablas,
// autenticación, roles, permisos y API /api/usuarios) — solo acota el
// listado y el selector de creación a empresas con operación On Street
// (/api/on-street-qr/companies, ya aislado por empresa server-side) y
// agrega el botón "Crear".
export default function OnStreetOperadoresPage() {
  return (
    <UsuariosPorRolClient
      rol="operator"
      titulo="Operadores On Street"
      descripcion="Operadores de empresas con operación On Street. Haz clic en un operador para abrir directamente su administración."
      placeholderBusqueda="Buscar operadores"
      backHref="/on-street-qr"
      backLabel="Volver a On Street"
      crear
      roleLabel="operador"
      empresasEndpoint="/api/on-street-qr/companies"
    />
  );
}
