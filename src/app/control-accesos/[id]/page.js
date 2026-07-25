import AppShell from "@/components/layout/AppShell";
import EstadoControlAccesoBadge from "@/components/control-accesos/EstadoControlAccesoBadge";
import TipoControlAccesoBadge from "@/components/control-accesos/TipoControlAccesoBadge";
import ModoControlAccesoBadge from "@/components/control-accesos/ModoControlAccesoBadge";
import {
  getControlAccesoById,
  resolveEstacionamiento,
  resolveDispositivo,
  resolveOperador,
  resolveUltimaOperacion,
  getDireccionLabel,
  formatHorario,
  formatCapacidad,
  formatFechaHora,
} from "@/data/controlAccesos.mjs";

export const metadata = {
  title: "Detalle de control de acceso | ParkFacil",
  description: "Vista detallada de un acceso demostrativo.",
};

export default function ControlAccesoDetallePage({ params }) {
  const acceso = getControlAccesoById(params.id);

  if (!acceso) {
    return (
      <AppShell title="Control de Accesos" description="Acceso no encontrado">
        <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-[#041E42]">Acceso no encontrado</h1>
          <p className="mt-2 text-sm text-slate-600">El identificador solicitado no existe en la muestra demo.</p>
        </div>
      </AppShell>
    );
  }

  const estacionamiento = resolveEstacionamiento(acceso);
  const dispositivo = resolveDispositivo(acceso);
  const operador = resolveOperador(acceso);
  const ultimaOperacion = resolveUltimaOperacion(acceso);

  return (
    <AppShell title={acceso.nombre} description="Detalle visual de control de accesos">
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#3150D8]">Detalle de acceso</p>
              <h1 className="mt-2 text-3xl font-semibold text-[#041E42]">{acceso.nombre}</h1>
              <p className="mt-2 text-sm text-slate-600">{acceso.codigo} · {acceso.estadoOperacional}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <TipoControlAccesoBadge tipoAcceso={acceso.tipoAcceso} />
              <EstadoControlAccesoBadge estado={acceso.estado} />
              <ModoControlAccesoBadge modoOperacion={acceso.modoOperacion} />
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Estacionamiento</p>
            <p className="mt-2 text-lg font-semibold text-[#041E42]">{estacionamiento?.nombre || "No disponible"}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Dispositivo relacionado</p>
            <p className="mt-2 text-lg font-semibold text-[#041E42]">{dispositivo?.nombre || "No disponible"}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Operador responsable</p>
            <p className="mt-2 text-lg font-semibold text-[#041E42]">{operador?.nombreCompleto || "No disponible"}</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Informacion general</h2>
            <dl className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex justify-between gap-3"><dt>Tipo de acceso</dt><dd className="font-semibold text-slate-900">{acceso.tipoAcceso}</dd></div>
              <div className="flex justify-between gap-3"><dt>Direccion</dt><dd className="font-semibold text-slate-900">{getDireccionLabel(acceso.direccion)}</dd></div>
              <div className="flex justify-between gap-3"><dt>Estado</dt><dd className="font-semibold text-slate-900">{acceso.estado}</dd></div>
              <div className="flex justify-between gap-3"><dt>Modo</dt><dd className="font-semibold text-slate-900">{acceso.modoOperacion}</dd></div>
              <div className="flex justify-between gap-3"><dt>Horario</dt><dd className="font-semibold text-slate-900">{formatHorario(acceso.horario)}</dd></div>
              <div className="flex justify-between gap-3"><dt>Capacidad</dt><dd className="font-semibold text-slate-900">{formatCapacidad(acceso.capacidad)}</dd></div>
              <div className="flex justify-between gap-3"><dt>Ultima actividad</dt><dd className="font-semibold text-slate-900">{formatFechaHora(acceso.ultimaActividad?.fechaHora)}</dd></div>
            </dl>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Historial demostrativo</h2>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              {acceso.historial.length > 0 ? acceso.historial.map((item) => (
                <p key={item}>• {item}</p>
              )) : <p>Etapa futura</p>}
              <p><span className="font-semibold text-slate-900">Ultima actividad:</span> {acceso.ultimaActividad?.descripcion || "Etapa futura"}</p>
              <p><span className="font-semibold text-slate-900">Operacion relacionada:</span> {ultimaOperacion?.ticketNumero || "Etapa futura"}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Incidencias</h2>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              {acceso.incidencias.length > 0 ? acceso.incidencias.map((item) => <p key={item}>• {item}</p>) : <p>Etapa futura</p>}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Configuracion</h2>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              {acceso.configuracion.length > 0 ? acceso.configuracion.map((item) => <p key={item}>• {item}</p>) : <p>Etapa futura</p>}
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Documentos</h2>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              {acceso.documentos.length > 0 ? acceso.documentos.map((item) => <p key={item}>• {item}</p>) : <p>Etapa futura</p>}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Observaciones</h2>
            <p className="mt-4 text-sm text-slate-600">{acceso.observaciones || "Etapa futura"}</p>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
          <p className="font-semibold text-[#041E42]">Etapa futura</p>
          <p className="mt-2">Las acciones reales de barrera, integracion con hardware, APIs, validaciones operativas, LPR, RFID y QR funcional se implementaran en etapas posteriores.</p>
        </div>
      </div>
    </AppShell>
  );
}
