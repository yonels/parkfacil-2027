import Link from "next/link";
import { CarFront, MapPin, UserRound, HardHat, Activity, CalendarClock } from "lucide-react";
import EstadoTicketBadge from "@/components/operacion/EstadoTicketBadge";
import TipoMovimientoBadge from "@/components/operacion/TipoMovimientoBadge";
import PermanenciaBadge from "@/components/operacion/PermanenciaBadge";
import { resolveEstacionamiento, resolveDispositivo, resolveOperador, getTipoUsuarioLabel, getMedioIdentificacionLabel, getOrigenLabel, formatFechaHora } from "@/data/operacion.mjs";

export default function OperacionCard({ operacion }) {
  return (
    <Link href={`/operacion/${operacion.id}`} className="group block rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#3150D8] hover:shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#3150D8]">{operacion.ticketNumero}</p>
          <h3 className="mt-1 text-lg font-semibold text-[#041E42]">{operacion.patente}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <TipoMovimientoBadge tipo={operacion.tipoMovimiento} />
          <EstadoTicketBadge estado={operacion.estadoTicket} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
        <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-[#3150D8]" /><span>{resolveEstacionamiento(operacion)}</span></div>
        <div className="flex items-center gap-2"><CarFront className="h-4 w-4 text-[#3150D8]" /><span>{getTipoUsuarioLabel(operacion.tipoUsuario)}</span></div>
        <div className="flex items-center gap-2"><HardHat className="h-4 w-4 text-[#3150D8]" /><span>{resolveOperador(operacion)}</span></div>
        <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-[#3150D8]" /><span>{formatFechaHora(operacion.fechaHora)}</span></div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <div className="flex items-center gap-2 text-sm text-slate-600"><Activity className="h-4 w-4 text-[#3150D8]" /><span>{resolveDispositivo(operacion)}</span></div>
        <div className="flex items-center gap-2 text-sm text-slate-600"><UserRound className="h-4 w-4 text-[#3150D8]" /><span>{getMedioIdentificacionLabel(operacion.medioIdentificacion)} · {getOrigenLabel(operacion.origen)}</span></div>
      </div>
      <div className="mt-3 flex justify-end">
        <PermanenciaBadge permanencia={operacion.permanenciaMinutos} />
      </div>
    </Link>
  );
}
