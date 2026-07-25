import Link from "next/link";
import { ArrowRight, Building2, Mail, Phone } from "lucide-react";
import EstadoEmpresaBadge from "@/components/empresas/EstadoEmpresaBadge";
import TipoRelacionBadge from "@/components/empresas/TipoRelacionBadge";
import { formatearRut } from "@/data/empresas.mjs";

export default function EmpresaCard({ empresa }) {
  return (
    <Link href={`/empresas/${empresa.id}`} className="group flex h-full min-h-[300px] min-w-0 flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#3150D8] hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#3150D8]">{formatearRut(`${empresa.rutNumero}-${empresa.rutDv}`)}</p>
          <h3 className="mt-2 line-clamp-3 text-[24px] font-semibold leading-7 text-[#041E42]">{empresa.razonSocial}</h3>
        </div>
        <EstadoEmpresaBadge estado={empresa.estado} />
      </div>

      <div className="mt-4 space-y-2 text-[15px] leading-5 text-slate-600">
        <div className="flex items-start gap-2"><Building2 className="mt-0.5 h-4 w-4 shrink-0 text-[#3150D8]" /><span className="line-clamp-2">{empresa.nombreFantasia}</span></div>
        <div className="flex items-start gap-2"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-[#3150D8]" /><span className="truncate">{empresa.correo}</span></div>
        <div className="flex items-start gap-2"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-[#3150D8]" /><span className="truncate">{empresa.telefono}</span></div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 pt-5 text-sm text-slate-500">
        <TipoRelacionBadge tipo={empresa.tipoRelacion} />
        <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap font-medium text-[#3150D8]">
          Ver detalle <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
