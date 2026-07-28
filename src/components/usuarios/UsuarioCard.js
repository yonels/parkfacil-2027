import Link from "next/link";
import { ArrowRight, Mail, Phone, Building2 } from "lucide-react";
import EstadoUsuarioBadge from "@/components/usuarios/EstadoUsuarioBadge";
import PerfilUsuarioBadge from "@/components/usuarios/PerfilUsuarioBadge";
import { getEmpresaAsociada } from "@/data/usuarios.mjs";
import { getPerfilLabel } from "@/data/usuarios.mjs";

export default function UsuarioCard({ usuario }) {
  const empresa = getEmpresaAsociada(usuario);

  return (
    <Link href={`/usuarios/${usuario.id}`} className="group flex min-w-0 flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#3150D8] hover:shadow-md">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#3150D8]" title={usuario.correo}>{usuario.correo}</p>
          <h3 className="mt-2 text-lg font-semibold text-[#041E42]">{usuario.nombreCompleto}</h3>
        </div>
        <span className="shrink-0 self-start"><EstadoUsuarioBadge estado={usuario.estado} /></span>
      </div>
      <div className="mt-4 min-w-0 space-y-2 text-sm text-slate-600">
        <div className="flex min-w-0 items-center gap-2"><Mail className="h-4 w-4 shrink-0 text-[#3150D8]" /><span className="truncate" title={usuario.correo}>{usuario.correo}</span></div>
        <div className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0 text-[#3150D8]" /><span>{usuario.telefono}</span></div>
        <div className="flex min-w-0 items-center gap-2"><Building2 className="h-4 w-4 shrink-0 text-[#3150D8]" /><span className="truncate">{empresa?.nombreFantasia ?? "Sin empresa"}</span></div>
      </div>
      <div className="mt-auto flex min-w-0 flex-col gap-3 pt-5 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span className="min-w-0"><PerfilUsuarioBadge perfil={usuario.perfilPrincipal} /></span>
        <span className="inline-flex shrink-0 items-center gap-2 font-medium text-[#3150D8]">
          Ver detalle <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
