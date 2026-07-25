import AppShell from "@/components/layout/AppShell";
import EstadoTicketBadge from "@/components/operacion/EstadoTicketBadge";
import TipoMovimientoBadge from "@/components/operacion/TipoMovimientoBadge";
import PermanenciaBadge from "@/components/operacion/PermanenciaBadge";
import { getOperacionById, resolveEstacionamiento, resolveDispositivo, resolveOperador, getTipoUsuarioLabel, getMedioIdentificacionLabel, getOrigenLabel, formatFechaHora, getRelacionIngresoSalida, calcularPermanencia } from "@/data/operacion.mjs";

export const metadata = {
  title: "Detalle de operación | ParkFacil",
  description: "Detalle visual de un movimiento operado.",
};

export default function OperacionDetallePage({ params }) {
  const operacion = getOperacionById(params.id);

  if (!operacion) {
    return (
      <AppShell>
        <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-[#041E42]">Movimiento no encontrado</h1>
          <p className="mt-2 text-sm text-slate-600">El identificador solicitado no existe en la muestra demo.</p>
        </div>
      </AppShell>
    );
  }

  const relacion = getRelacionIngresoSalida(operacion);
  const permanencia = calcularPermanencia(operacion, relacion);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#3150D8]">Detalle de operación</p>
              <h1 className="mt-2 text-3xl font-semibold text-[#041E42]">{operacion.ticketNumero}</h1>
              <p className="mt-2 text-sm text-slate-600">Patente {operacion.patente} · {formatFechaHora(operacion.fechaHora)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <TipoMovimientoBadge tipo={operacion.tipoMovimiento} />
              <EstadoTicketBadge estado={operacion.estadoTicket} />
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Estacionamiento</p>
            <p className="mt-2 text-lg font-semibold text-[#041E42]">{resolveEstacionamiento(operacion)}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Operador</p>
            <p className="mt-2 text-lg font-semibold text-[#041E42]">{resolveOperador(operacion)}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Permanencia</p>
            <div className="mt-2"><PermanenciaBadge permanencia={permanencia} /></div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Información de control</h2>
            <dl className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex justify-between gap-3"><dt>Acceso</dt><dd className="font-semibold text-slate-900">{operacion.acceso}</dd></div>
              <div className="flex justify-between gap-3"><dt>Dispositivo</dt><dd className="font-semibold text-slate-900">{resolveDispositivo(operacion)}</dd></div>
              <div className="flex justify-between gap-3"><dt>Tipo de usuario</dt><dd className="font-semibold text-slate-900">{getTipoUsuarioLabel(operacion.tipoUsuario)}</dd></div>
              <div className="flex justify-between gap-3"><dt>Medio de identificación</dt><dd className="font-semibold text-slate-900">{getMedioIdentificacionLabel(operacion.medioIdentificacion)}</dd></div>
              <div className="flex justify-between gap-3"><dt>Origen</dt><dd className="font-semibold text-slate-900">{getOrigenLabel(operacion.origen)}</dd></div>
            </dl>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Observaciones y auditoría</h2>
            <p className="mt-4 text-sm text-slate-600">{operacion.observaciones}</p>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p><span className="font-semibold text-slate-900">Eventos:</span> {operacion.eventos.join(" · ")}</p>
              <p><span className="font-semibold text-slate-900">Auditoría:</span> {operacion.auditoria.join(" · ")}</p>
              <p><span className="font-semibold text-slate-900">Incidencias:</span> {operacion.incidencias.length ? operacion.incidencias.join(" · ") : "Sin incidencias"}</p>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
