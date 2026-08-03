import Link from "next/link";
import { ArrowRight, Building2, Mail, Phone } from "lucide-react";
import EstadoEmpresaBadge from "@/components/empresas/EstadoEmpresaBadge";
import TipoRelacionBadge from "@/components/empresas/TipoRelacionBadge";
import { formatearRut } from "@/data/empresas.mjs";

export default function EmpresaCard({ empresa }) {
  return (
    <Link href={`/empresas/${empresa.id}`} className="group flex min-w-0 flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#3150D8] hover:shadow-md">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#3150D8]">{formatearRut(`${empresa.rutNumero}-${empresa.rutDv}`)}</p>
          <h3 className="mt-2 break-words text-lg font-semibold leading-7 text-[#041E42]">{empresa.razonSocial}</h3>
        </div>
        <span className="shrink-0 self-start"><EstadoEmpresaBadge estado={empresa.estado} /></span>
      </div>
      <div className="mt-4 min-w-0 space-y-2 text-sm text-slate-600">
        <div className="flex min-w-0 items-center gap-2"><Building2 className="h-4 w-4 shrink-0 text-[#3150D8]" /><span className="truncate">{empresa.nombreFantasia}</span></div>
        <div className="flex min-w-0 items-center gap-2"><Mail className="h-4 w-4 shrink-0 text-[#3150D8]" /><span className="truncate" title={empresa.correo}>{empresa.correo}</span></div>
        <div className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0 text-[#3150D8]" /><span>{empresa.telefono}</span></div>
      </div>
      <div className="mt-auto flex min-w-0 flex-col gap-3 pt-5 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span className="min-w-0"><TipoRelacionBadge tipo={empresa.tipoRelacion} /></span>
        <span className="inline-flex shrink-0 items-center gap-2 font-medium text-[#3150D8]">
          Ver detalle <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
