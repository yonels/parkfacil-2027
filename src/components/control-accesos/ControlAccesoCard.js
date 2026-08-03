import Link from "next/link";
import { MapPin, Cpu, UserRound, Activity, Clock3 } from "lucide-react";
import EstadoControlAccesoBadge from "@/components/control-accesos/EstadoControlAccesoBadge";
import TipoControlAccesoBadge from "@/components/control-accesos/TipoControlAccesoBadge";
import ModoControlAccesoBadge from "@/components/control-accesos/ModoControlAccesoBadge";
import { resolveEstacionamiento, resolveDispositivo, resolveOperador, formatHorario, formatCapacidad } from "@/data/controlAccesos.mjs";

export default function ControlAccesoCard({ acceso }) {
  const estacionamiento = resolveEstacionamiento(acceso);
  const dispositivo = resolveDispositivo(acceso);
  const operador = resolveOperador(acceso);

  return (
    <Link href={`/control-accesos/${acceso.id}`} className="group flex min-w-0 flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#3150D8] hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#3150D8]">{acceso.codigo}</p>
          <h3 className="mt-1 text-lg font-semibold text-[#041E42]">{acceso.nombre}</h3>
          <p className="mt-1 text-sm text-slate-600">{acceso.estadoOperacional}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TipoControlAccesoBadge tipoAcceso={acceso.tipoAcceso} />
          <EstadoControlAccesoBadge estado={acceso.estado} />
          <ModoControlAccesoBadge modoOperacion={acceso.modoOperacion} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
        <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-[#3150D8]" /><span>{estacionamiento?.nombre || "No disponible"}</span></div>
        <div className="flex items-center gap-2"><Cpu className="h-4 w-4 text-[#3150D8]" /><span>{dispositivo?.nombre || "No disponible"}</span></div>
        <div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-[#3150D8]" /><span>{operador?.nombreCompleto || "No disponible"}</span></div>
        <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-[#3150D8]" /><span>{formatHorario(acceso.horario)}</span></div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm text-slate-600">
        <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-[#3150D8]" /><span>{acceso.ultimaActividad?.descripcion || "Sin actividad"}</span></div>
        <span className="font-medium text-slate-700">{formatCapacidad(acceso.capacidad)}</span>
      </div>
    </Link>
  );
}
