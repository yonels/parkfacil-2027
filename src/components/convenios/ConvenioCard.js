import Link from "next/link";
import { Building2, ParkingSquare, UserRound, Clock3 } from "lucide-react";
import EstadoConvenioBadge from "@/components/convenios/EstadoConvenioBadge";
import TipoConvenioBadge from "@/components/convenios/TipoConvenioBadge";
import ModalidadBeneficioBadge from "@/components/convenios/ModalidadBeneficioBadge";
import VigenciaConvenioBadge from "@/components/convenios/VigenciaConvenioBadge";
import {
  resolveEmpresaPrincipal,
  resolveEstacionamientos,
  resolveUsuarioResponsable,
  calcularVigencia,
  formatDate,
  formatValorDemostrativo,
} from "@/data/convenios.mjs";

export default function ConvenioCard({ convenio, referenceDate = "2026-07-25T10:15:00" }) {
  const empresa = resolveEmpresaPrincipal(convenio);
  const estacionamientos = resolveEstacionamientos(convenio);
  const responsable = resolveUsuarioResponsable(convenio);
  const vigencia = calcularVigencia(convenio, referenceDate);

  return (
    <Link href={`/convenios/${convenio.id}`} className="group block rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#3150D8] hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#3150D8]">{convenio.codigo}</p>
          <h3 className="mt-1 text-lg font-semibold text-[#041E42]">{convenio.nombre}</h3>
          <p className="mt-1 text-sm text-slate-600">{convenio.descripcion}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TipoConvenioBadge tipo={convenio.tipo} />
          <EstadoConvenioBadge estado={convenio.estado} />
          <ModalidadBeneficioBadge modalidad={convenio.modalidadBeneficio} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
        <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-[#3150D8]" /><span>Empresa: {empresa?.nombreFantasia || "No disponible"}</span></div>
        <div className="flex items-center gap-2"><ParkingSquare className="h-4 w-4 text-[#3150D8]" /><span>Estacionamientos: {estacionamientos.length ? estacionamientos.map((item) => item.nombre).join(", ") : "No disponible"}</span></div>
        <div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-[#3150D8]" /><span>Responsable: {responsable?.nombreCompleto || "No disponible"}</span></div>
        <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-[#3150D8]" /><span>{formatDate(convenio.vigencia.validFrom)} - {formatDate(convenio.vigencia.validUntil)}</span></div>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-600">
        <p><span className="font-semibold text-slate-900">Beneficiarios:</span> {convenio.beneficiarios.length}</p>
        <p className="mt-1"><span className="font-semibold text-slate-900">Usos:</span> {convenio.utilizacion.totalUses}</p>
        <p className="mt-1"><span className="font-semibold text-slate-900">Consumo acumulado:</span> {formatValorDemostrativo(convenio.utilizacion.accumulatedDiscount)}</p>
        <p className="mt-1"><span className="font-semibold text-slate-900">Limite de uso:</span> {convenio.beneficio.maximumUses}</p>
      </div>

      <div className="mt-3 flex items-center justify-end">
        <VigenciaConvenioBadge vigencia={vigencia.etiqueta} />
      </div>
    </Link>
  );
}
