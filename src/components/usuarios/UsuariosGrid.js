import UsuarioCard from "@/components/usuarios/UsuarioCard";

export default function UsuariosGrid({ usuarios }) {
  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
      {usuarios.map((usuario) => (
        <UsuarioCard key={usuario.id} usuario={usuario} />
      ))}
    </div>
  );
}
