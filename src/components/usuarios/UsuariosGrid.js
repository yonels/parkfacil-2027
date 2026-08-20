import UsuarioCard from "@/components/usuarios/UsuarioCard";

// empresas: lista real de empresas (API) para resolver la tarjeta de cada
// usuario por empresaId. Si se omite, UsuarioCard usa su comportamiento
// demostrativo original.
export default function UsuariosGrid({ usuarios, empresas }) {
  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
      {usuarios.map((usuario) => (
        <UsuarioCard
          key={usuario.id}
          usuario={usuario}
          empresa={empresas ? empresas.find((item) => item.id === usuario.empresaId) || null : undefined}
        />
      ))}
    </div>
  );
}
