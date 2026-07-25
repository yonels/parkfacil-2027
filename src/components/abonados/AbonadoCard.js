import Link from "next/link";
import { Building2, CarFront, Mail, Phone, BadgeCheck, CalendarClock, KeyRound } from "lucide-react";
import EstadoAbonadoBadge from "@/components/abonados/EstadoAbonadoBadge";
import TipoAbonadoBadge from "@/components/abonados/TipoAbonadoBadge";
import CredencialBadge from "@/components/abonados/CredencialBadge";
import VigenciaAbonadoBadge from "@/components/abonados/VigenciaAbonadoBadge";
import { resolveEmpresa, resolveEstacionamientos, resolveResponsable, getPatentePrincipal, getCredenciales, getTextoVigencia, formatDate } from "@/data/abonados.mjs";

export default function AbonadoCard({ abonado }) {
  const empresa = resolveEmpresa(abonado);
  const estacionamientos = resolveEstacionamientos(abonado);
  const responsable = resolveResponsable(abonado);
  const patentePrincipal = getPatentePrincipal(abonado);
  const credenciales = getCredenciales(abonado);
  const vigencia = getTextoVigencia(abonado, "2026-08-01");

  return (
    <Link href={`/abonados/${abonado.id}`} className="group block rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#3150D8] hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#3150D8]">{abonado.identificador}</p>
          <h3 className="mt-1 text-lg font-semibold text-[#041E42]">{abonado.nombre}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <EstadoAbonadoBadge estado={abonado.estado} />
          <TipoAbonadoBadge tipo={abonado.tipo} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
        <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-[#3150D8]" /><span>{empresa?.nombreFantasia || "Sin empresa"}</span></div>
        <div className="flex items-center gap-2"><CarFront className="h-4 w-4 text-[#3150D8]" /><span>{patentePrincipal || "Sin patente"}</span></div>
        <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-[#3150D8]" /><span>{abonado.correo}</span></div>
        <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-[#3150D8]" /><span>{abonado.telefono}</span></div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {credenciales.slice(0, 2).map((credencial) => (
          <CredencialBadge key={credencial.id} tipo={credencial.tipo} estado={credencial.estado} />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm text-slate-600">
        <div className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-[#3150D8]" /><span>{responsable}</span></div>
        <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-[#3150D8]" /><span>{formatDate(abonado.fechaInicio)} · {formatDate(abonado.fechaTermino)}</span></div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-[#3150D8]" /><span>{estacionamientos.length} estacionamientos autorizados</span></div>
        <VigenciaAbonadoBadge texto={vigencia} />
      </div>
    </Link>
  );
}
