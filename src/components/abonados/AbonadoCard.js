import Link from "next/link";
import { Building2, CarFront, Mail, Phone, BadgeCheck, CalendarClock, KeyRound, Eye, Pencil } from "lucide-react";
import EstadoAbonadoBadge from "@/components/abonados/EstadoAbonadoBadge";
import TipoAbonadoBadge from "@/components/abonados/TipoAbonadoBadge";
import CredencialBadge from "@/components/abonados/CredencialBadge";
import VigenciaAbonadoBadge from "@/components/abonados/VigenciaAbonadoBadge";
import { resolveEmpresa, resolveEstacionamientos, getPatentePrincipal, getCredenciales, getTextoVigencia, formatDate } from "@/data/abonados.mjs";
import { resolveResponsableName } from "@/components/abonados/abonadosStore";

export default function AbonadoCard({ abonado }) {
  const empresa = resolveEmpresa(abonado);
  const estacionamientos = resolveEstacionamientos(abonado);
  const responsable = resolveResponsableName(abonado);
  const patentePrincipal = getPatentePrincipal(abonado);
  const credenciales = getCredenciales(abonado);
  const vigencia = getTextoVigencia(abonado, "2026-08-01");

  return (
    <article className="group flex h-full min-h-[320px] flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#3150D8] hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#3150D8]">{abonado.identificador}</p>
          <Link href={`/abonados/${abonado.id}`} className="mt-1 inline-block rounded-md text-lg font-semibold text-[#041E42] transition hover:text-[#3150D8] focus:outline-none focus:ring-2 focus:ring-[#1E5EFF]/20">
            <span className="line-clamp-2">{abonado.nombre}</span>
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <EstadoAbonadoBadge estado={abonado.estado} />
          <TipoAbonadoBadge tipo={abonado.tipo} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
        <div className="flex items-center gap-2"><Building2 className="h-4 w-4 shrink-0 text-[#3150D8]" /><span className="truncate">{empresa?.nombreFantasia || "Sin empresa"}</span></div>
        <div className="flex items-center gap-2"><CarFront className="h-4 w-4 shrink-0 text-[#3150D8]" /><span className="truncate">{patentePrincipal || "Sin patente"}</span></div>
        <div className="flex items-center gap-2"><Mail className="h-4 w-4 shrink-0 text-[#3150D8]" /><span className="truncate">{abonado.correo}</span></div>
        <div className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0 text-[#3150D8]" /><span className="truncate">{abonado.telefono}</span></div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {credenciales.slice(0, 2).map((credencial) => (
          <CredencialBadge key={credencial.id} tipo={credencial.tipo} estado={credencial.estado} />
        ))}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm text-slate-600">
        <div className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 shrink-0 text-[#3150D8]" /><span className="truncate">{responsable}</span></div>
        <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 shrink-0 text-[#3150D8]" /><span>{formatDate(abonado.fechaInicio)} · {formatDate(abonado.fechaTermino)}</span></div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-[#3150D8]" /><span>{estacionamientos.length} estacionamientos autorizados</span></div>
        <VigenciaAbonadoBadge texto={vigencia} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <Link href={`/abonados/${abonado.id}`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#3150D8] transition hover:border-[#3150D8] hover:bg-[#EEF4FF] focus:outline-none focus:ring-2 focus:ring-[#1E5EFF]/20">
          <Eye className="h-4 w-4" />
          Ver detalle
        </Link>
        <Link href={`/abonados/${abonado.id}/editar`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#041E42] transition hover:border-[#3150D8] hover:text-[#3150D8] focus:outline-none focus:ring-2 focus:ring-[#1E5EFF]/20">
          <Pencil className="h-4 w-4" />
          Editar
        </Link>
      </div>
    </article>
  );
}
