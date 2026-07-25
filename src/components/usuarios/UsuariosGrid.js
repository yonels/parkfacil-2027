import UsuarioCard from "@/components/usuarios/UsuarioCard";

export default function UsuariosGrid({ usuarios }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {usuarios.map((usuario) => (
        <UsuarioCard key={usuario.id} usuario={usuario} />
      ))}
    </div>
  );
}
