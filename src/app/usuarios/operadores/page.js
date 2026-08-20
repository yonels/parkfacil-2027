import UsuariosPorRolClient from "@/components/usuarios/UsuariosPorRolClient";

export const metadata = {
  title: "Operadores | ParkFacil 2027",
};

export default function OperadoresPage() {
  return (
    <UsuariosPorRolClient
      rol="operator"
      titulo="Operadores"
      descripcion="Operadores de todos los clientes. Haz clic en un operador para abrir directamente su administración."
      placeholderBusqueda="Buscar operadores"
      backHref="/usuarios"
      backLabel="Volver a Usuarios"
    />
  );
}
