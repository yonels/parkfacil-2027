import UsuarioDetalleClient from "@/components/usuarios/UsuarioDetalleClient";

export default async function UsuarioDetallePage({ params }) {
  const { id } = await params;
  return <UsuarioDetalleClient userId={id} />;
}
