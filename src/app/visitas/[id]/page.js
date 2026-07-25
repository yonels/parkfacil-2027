import AppShell from "@/components/layout/AppShell";
import EstadoVisitaBadge from "@/components/visitas/EstadoVisitaBadge";
import TipoVisitaBadge from "@/components/visitas/TipoVisitaBadge";
import AprobacionVisitaBadge from "@/components/visitas/AprobacionVisitaBadge";
import VigenciaVisitaBadge from "@/components/visitas/VigenciaVisitaBadge";
import VehiculoVisitaCard from "@/components/visitas/VehiculoVisitaCard";
import PermisosVisitaCard from "@/components/visitas/PermisosVisitaCard";
import {
  getVisitaById,
  resolveAnfitrion,
  resolveEmpresaAnfitriona,
  resolveEstacionamientos,
  resolveAccesos,
  resolveMovimientosRelacionados,
  resolveAbonadoRelacionado,
  getVehiculo,
  getAcompanantes,
  calcularDuracionAutorizada,
  calcularVigencia,
  formatDate,
  formatHour,
  formatRangoHorario,
  getTipoVisitaLabel,
  getEstadoVisitaLabel,
  getEstadoAprobacionLabel,
  getMedioIdentificacionLabel,
} from "@/data/visitas.mjs";

export const metadata = {
  title: "Detalle de visita | ParkFacil",
  description: "Detalle visual de visitas y reservas demostrativas.",
};

const referenceDate = "2026-07-25T10:15:00";

export default function VisitaDetallePage({ params }) {
  const visita = getVisitaById(params.id);

  if (!visita) {
    return (
      <AppShell title="Visitas y Reservas" description="Visita no encontrada">
        <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-[#041E42]">Visita no encontrada</h1>
          <p className="mt-2 text-sm text-slate-600">El identificador solicitado no existe en la muestra demostrativa.</p>
        </div>
      </AppShell>
    );
  }

  const anfitrion = resolveAnfitrion(visita);
  const empresaAnfitriona = resolveEmpresaAnfitriona(visita);
  const estacionamientos = resolveEstacionamientos(visita);
  const accesos = resolveAccesos(visita);
  const movimientos = resolveMovimientosRelacionados(visita);
  const abonado = resolveAbonadoRelacionado(visita);
  const vehiculo = getVehiculo(visita);
  const acompanantes = getAcompanantes(visita);
  const vigencia = calcularVigencia(visita, referenceDate);

  return (
    <AppShell title={visita.codigo} description="Detalle visual de la visita demostrativa">
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#3150D8]">Detalle de visita</p>
              <h1 className="mt-2 text-3xl font-semibold text-[#041E42]">{visita.codigo}</h1>
              <p className="mt-2 text-sm text-slate-600">{visita.visitante.nombre} · {formatDate(visita.visitDate)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <TipoVisitaBadge tipoVisita={visita.tipoVisita} />
              <EstadoVisitaBadge estado={visita.estado} />
              <AprobacionVisitaBadge estadoAprobacion={visita.estadoAprobacion} />
              <VigenciaVisitaBadge vigencia={vigencia.texto} />
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Informacion general</h2>
            <dl className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex justify-between gap-3"><dt>Codigo</dt><dd className="font-semibold text-slate-900">{visita.codigo}</dd></div>
              <div className="flex justify-between gap-3"><dt>Visitante</dt><dd className="font-semibold text-slate-900">{visita.visitante.nombre}</dd></div>
              <div className="flex justify-between gap-3"><dt>Identificador</dt><dd className="font-semibold text-slate-900">{visita.visitante.identificador || "No disponible"}</dd></div>
              <div className="flex justify-between gap-3"><dt>Correo</dt><dd className="font-semibold text-slate-900">{visita.visitante.correo || "No disponible"}</dd></div>
              <div className="flex justify-between gap-3"><dt>Telefono</dt><dd className="font-semibold text-slate-900">{visita.visitante.telefono || "No disponible"}</dd></div>
              <div className="flex justify-between gap-3"><dt>Empresa de origen</dt><dd className="font-semibold text-slate-900">{visita.visitante.empresaOrigen || "No disponible"}</dd></div>
              <div className="flex justify-between gap-3"><dt>Motivo</dt><dd className="font-semibold text-slate-900">{visita.motivo || "No disponible"}</dd></div>
              <div className="flex justify-between gap-3"><dt>Tipo</dt><dd className="font-semibold text-slate-900">{getTipoVisitaLabel(visita.tipoVisita)}</dd></div>
              <div className="flex justify-between gap-3"><dt>Estado</dt><dd className="font-semibold text-slate-900">{getEstadoVisitaLabel(visita.estado)}</dd></div>
              <div className="flex justify-between gap-3"><dt>Aprobacion</dt><dd className="font-semibold text-slate-900">{getEstadoAprobacionLabel(visita.estadoAprobacion)}</dd></div>
            </dl>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Anfitrion</h2>
            <dl className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex justify-between gap-3"><dt>Usuario anfitrion</dt><dd className="font-semibold text-slate-900">{anfitrion?.nombreCompleto || "No disponible"}</dd></div>
              <div className="flex justify-between gap-3"><dt>Empresa anfitriona</dt><dd className="font-semibold text-slate-900">{empresaAnfitriona?.nombreFantasia || "No disponible"}</dd></div>
              <div className="flex justify-between gap-3"><dt>Correo anfitrion</dt><dd className="font-semibold text-slate-900">{anfitrion?.correo || "No disponible"}</dd></div>
              <div className="flex justify-between gap-3"><dt>Telefono anfitrion</dt><dd className="font-semibold text-slate-900">{anfitrion?.telefono || "No disponible"}</dd></div>
              <div className="flex justify-between gap-3"><dt>Responsable alternativo</dt><dd className="font-semibold text-slate-900">{visita.responsableAlternativo || "No disponible"}</dd></div>
            </dl>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Reserva y vigencia</h2>
            <dl className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex justify-between gap-3"><dt>Fecha</dt><dd className="font-semibold text-slate-900">{formatDate(visita.visitDate)}</dd></div>
              <div className="flex justify-between gap-3"><dt>Horario autorizado</dt><dd className="font-semibold text-slate-900">{formatRangoHorario(visita)}</dd></div>
              <div className="flex justify-between gap-3"><dt>Duracion</dt><dd className="font-semibold text-slate-900">{calcularDuracionAutorizada(visita)} min</dd></div>
              <div className="flex justify-between gap-3"><dt>Vigencia</dt><dd className="font-semibold text-slate-900">{vigencia.texto}</dd></div>
              <div className="flex justify-between gap-3"><dt>Tolerancia</dt><dd className="font-semibold text-slate-900">{visita.gracePeriodMinutes} min</dd></div>
              <div className="flex justify-between gap-3"><dt>Entradas maximas</dt><dd className="font-semibold text-slate-900">{visita.maximumEntries}</dd></div>
              <div className="flex justify-between gap-3"><dt>Modalidad de ingreso</dt><dd className="font-semibold text-slate-900">{visita.multipleEntry ? "Multiples ingresos" : "Ingreso unico"}</dd></div>
              <div className="flex justify-between gap-3"><dt>Medio de identificacion</dt><dd className="font-semibold text-slate-900">{getMedioIdentificacionLabel(visita.medioIdentificacion)}</dd></div>
            </dl>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Vehiculo</h2>
            <div className="mt-4">
              <VehiculoVisitaCard vehiculo={vehiculo} />
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Accesos y permisos</h2>
            <div className="mt-4">
              <PermisosVisitaCard visita={visita} estacionamientos={estacionamientos} accesos={accesos} />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Actividad demostrativa</h2>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p><span className="font-semibold text-slate-900">Hora de ingreso:</span> {visita.actividad?.ingresoHora ? formatHour(visita.actividad.ingresoHora.split("T")[1]) : "No disponible"}</p>
              <p><span className="font-semibold text-slate-900">Hora de salida:</span> {visita.actividad?.salidaHora ? formatHour(visita.actividad.salidaHora.split("T")[1]) : "No disponible"}</p>
              <p><span className="font-semibold text-slate-900">Operador:</span> {visita.actividad?.operadorId || "No disponible"}</p>
              <p><span className="font-semibold text-slate-900">Dispositivo:</span> {visita.actividad?.dispositivoId || "No disponible"}</p>
              <p><span className="font-semibold text-slate-900">Movimientos relacionados:</span> {movimientos.length ? movimientos.map((item) => item.ticketNumero).join(", ") : "No disponible"}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Observaciones e incidencias</h2>
            <p className="mt-4 text-sm text-slate-600">{visita.observaciones || "Etapa futura"}</p>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              {visita.incidencias.length ? visita.incidencias.map((item) => <p key={item}>• {item}</p>) : <p>Etapa futura</p>}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Acompanantes</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              {acompanantes.length ? acompanantes.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="font-semibold text-[#041E42]">{item.name || "No disponible"}</p>
                  <p className="mt-1">Identificador: {item.identifier || "No disponible"}</p>
                  <p className="mt-1">Correo: {item.email || "No disponible"}</p>
                  <p className="mt-1">Telefono: {item.phone || "No disponible"}</p>
                  <p className="mt-1">Notas: {item.notes || "No disponible"}</p>
                </div>
              )) : <p>Etapa futura</p>}
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Historial y auditoria</h2>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              {visita.historial.length ? visita.historial.map((item) => <p key={item}>• {item}</p>) : <p>Etapa futura</p>}
              {visita.auditoria.length ? visita.auditoria.map((item) => <p key={item}>• {item}</p>) : <p>Etapa futura</p>}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Documentos y notificaciones</h2>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p><span className="font-semibold text-slate-900">Documentos:</span> {visita.documentos.length ? visita.documentos.join(" · ") : "Etapa futura"}</p>
              <p><span className="font-semibold text-slate-900">Notificaciones:</span> {visita.notificaciones.length ? visita.notificaciones.join(" · ") : "Etapa futura"}</p>
              <p><span className="font-semibold text-slate-900">Abonado relacionado:</span> {abonado?.nombre || "No disponible"}</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
          <p className="font-semibold text-[#041E42]">Etapa futura</p>
          <p className="mt-2">No se implementan aprobaciones reales, ingresos o salidas reales, apertura de barreras, generacion de QR operativo, emision de credenciales, envio de correos o mensajes, ni integracion con hardware.</p>
        </div>
      </div>
    </AppShell>
  );
}
