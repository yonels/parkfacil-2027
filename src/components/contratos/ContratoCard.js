import Link from "next/link";
import { CalendarDays, Building2, MapPin, UserRound, BadgeDollarSign } from "lucide-react";
import EstadoContratoBadge from "@/components/contratos/EstadoContratoBadge";
import TipoContratoBadge from "@/components/contratos/TipoContratoBadge";
import VigenciaContratoBadge from "@/components/contratos/VigenciaContratoBadge";
import { formatCurrency, resolveEmpresa, resolveEstacionamientos, resolveResponsable, calcularVigencia } from "@/data/contratos.mjs";

export default function ContratoCard({ contrato }) {
  const empresa = resolveEmpresa(contrato);
  const estacionamientos = resolveEstacionamientos(contrato);
  const responsable = resolveResponsable(contrato);
  const vigencia = calcularVigencia(contrato, new Date("2026-01-15"));

  return (
    <Link href={`/contratos/${contrato.id}`} className="group block rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#3150D8] hover:shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#3150D8]">{contrato.numeroContrato}</p>
          <h3 className="mt-1 text-lg font-semibold text-[#041E42]">{empresa?.razonSocial || "No disponible"}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <EstadoContratoBadge estado={contrato.estado} />
          <TipoContratoBadge tipo={contrato.tipo} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
        <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-[#3150D8]" /><span>{estacionamientos.length > 0 ? estacionamientos.map((item) => item.nombre).join(", ") : "Sin estacionamiento"}</span></div>
        <div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-[#3150D8]" /><span>{responsable}</span></div>
        <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[#3150D8]" /><span>{contrato.fechaInicio} → {contrato.fechaTermino}</span></div>
        <div className="flex items-center gap-2"><BadgeDollarSign className="h-4 w-4 text-[#3150D8]" /><span>{formatCurrency(contrato.monthlyValue, contrato.currency)}</span></div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <div className="flex items-center gap-2 text-sm text-slate-600"><Building2 className="h-4 w-4 text-[#3150D8]" /><span>{contrato.tipo === "software_service" ? "Servicio de software" : contrato.tipo}</span></div>
        <VigenciaContratoBadge vigencia={vigencia} />
      </div>
    </Link>
  );
}
