import Link from "next/link";
import { Building2, UserRound, ParkingSquare, CarFront, Clock3 } from "lucide-react";
import EstadoVisitaBadge from "@/components/visitas/EstadoVisitaBadge";
import TipoVisitaBadge from "@/components/visitas/TipoVisitaBadge";
import AprobacionVisitaBadge from "@/components/visitas/AprobacionVisitaBadge";
import VigenciaVisitaBadge from "@/components/visitas/VigenciaVisitaBadge";
import {
  resolveAnfitrion,
  resolveEmpresaAnfitriona,
  resolveEstacionamientos,
  resolveAccesos,
  getMedioIdentificacionLabel,
  formatDate,
  formatHour,
  getVigenciaLabel,
} from "@/data/visitas.mjs";

export default function VisitaCard({ visita, referenceDate = "2026-07-25T10:15:00" }) {
  const anfitrion = resolveAnfitrion(visita);
  const empresaAnfitriona = resolveEmpresaAnfitriona(visita);
  const estacionamientos = resolveEstacionamientos(visita);
  const accesos = resolveAccesos(visita);
  const vigencia = getVigenciaLabel(visita, referenceDate);

  return (
    <Link href={`/visitas/${visita.id}`} className="group block rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#3150D8] hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#3150D8]">{visita.codigo}</p>
          <h3 className="mt-1 text-lg font-semibold text-[#041E42]">{visita.visitante.nombre}</h3>
          <p className="mt-1 text-sm text-slate-600">{visita.visitante.identificador || "No disponible"} · {visita.visitante.rut || "No disponible"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TipoVisitaBadge tipoVisita={visita.tipoVisita} />
          <EstadoVisitaBadge estado={visita.estado} />
          <AprobacionVisitaBadge estadoAprobacion={visita.estadoAprobacion} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
        <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-[#3150D8]" /><span>Empresa origen: {visita.visitante.empresaOrigen || "No disponible"}</span></div>
        <div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-[#3150D8]" /><span>Anfitrion: {anfitrion?.nombreCompleto || "No disponible"}</span></div>
        <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-[#3150D8]" /><span>Empresa anfitriona: {empresaAnfitriona?.nombreFantasia || "No disponible"}</span></div>
        <div className="flex items-center gap-2"><ParkingSquare className="h-4 w-4 text-[#3150D8]" /><span>Estacionamiento: {estacionamientos[0]?.nombre || "No disponible"}</span></div>
        <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-[#3150D8]" /><span>{formatDate(visita.visitDate)} · {formatHour(visita.entryFrom)} - {formatHour(visita.exitUntil)}</span></div>
        <div className="flex items-center gap-2"><CarFront className="h-4 w-4 text-[#3150D8]" /><span>Patente: {visita.vehicle?.licensePlate || "No disponible"}</span></div>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-600">
        <p><span className="font-semibold text-slate-900">Acceso autorizado:</span> {accesos[0]?.codigo || "No disponible"}</p>
        <p className="mt-1"><span className="font-semibold text-slate-900">Medio de identificacion:</span> {getMedioIdentificacionLabel(visita.medioIdentificacion)}</p>
        <p className="mt-1"><span className="font-semibold text-slate-900">Observacion:</span> {visita.observaciones || "No disponible"}</p>
      </div>

      <div className="mt-3 flex items-center justify-end">
        <VigenciaVisitaBadge vigencia={vigencia} />
      </div>
    </Link>
  );
}
