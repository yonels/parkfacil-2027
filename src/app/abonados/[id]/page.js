import AppShell from "@/components/layout/AppShell";
import EstadoAbonadoBadge from "@/components/abonados/EstadoAbonadoBadge";
import TipoAbonadoBadge from "@/components/abonados/TipoAbonadoBadge";
import CredencialBadge from "@/components/abonados/CredencialBadge";
import VigenciaAbonadoBadge from "@/components/abonados/VigenciaAbonadoBadge";
import { resolveEmpresa, resolveEstacionamientos, resolveResponsable, resolveContrato, getVehiculos, getCredenciales, getPermisos, getPatentePrincipal, getTextoVigencia, formatDate } from "@/data/abonados.mjs";
import { getCurrentServerContext } from "@/lib/auth/currentServerContext";
import { assignedParkingIds } from "@/lib/auth/parkingAuthorization";
import { subscriberQueryScope } from "@/lib/auth/subscriberAuthorizationCore.mjs";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { fetchAbonadosBundle } from "@/lib/abonadosRepository";

export const metadata = {
  title: "Detalle de abonado | ParkFacil",
  description: "Detalle visual de un abonado y sus credenciales.",
};

export default async function AbonadoDetallePage({ params }) {
  const resolvedParams = await params;
  const context = await getCurrentServerContext();
  const db = getSupabaseAdminClient();
  const assigned = await assignedParkingIds(db, context);
  const result = await fetchAbonadosBundle(db, { id: resolvedParams.id }, subscriberQueryScope(context, assigned || []));
  const abonado = result.data?.[0] || null;

  if (!abonado) {
    return (
      <AppShell title="Detalle de abonado" description="Abonado no encontrado">
        <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-[#041E42]">Abonado no encontrado</h1>
          <p className="mt-2 text-sm text-slate-600">El identificador solicitado no existe o no esta disponible.</p>
        </div>
      </AppShell>
    );
  }

  const empresa = resolveEmpresa(abonado);
  const estacionamientos = resolveEstacionamientos(abonado);
  const responsable = resolveResponsable(abonado);
  const contrato = resolveContrato(abonado);
  const vehiculos = getVehiculos(abonado);
  const credenciales = getCredenciales(abonado);
  const permisos = getPermisos(abonado);
  const vigencia = getTextoVigencia(abonado, new Date().toISOString().slice(0, 10));

  return (
    <AppShell title={abonado.nombre} description="Detalle visual del abonado">
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#3150D8]">Detalle de abonado</p>
              <h1 className="mt-2 text-3xl font-semibold text-[#041E42]">{abonado.nombre}</h1>
              <p className="mt-2 text-sm text-slate-600">{abonado.identificador} · {empresa?.nombreFantasia || "Sin empresa"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <EstadoAbonadoBadge estado={abonado.estado} />
              <TipoAbonadoBadge tipo={abonado.tipo} />
              <VigenciaAbonadoBadge texto={vigencia} />
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Contacto</p>
            <p className="mt-2 text-lg font-semibold text-[#041E42]">{abonado.correo}</p>
            <p className="mt-1 text-sm text-slate-600">{abonado.telefono}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Responsable</p>
            <p className="mt-2 text-lg font-semibold text-[#041E42]">{responsable}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Vigencia</p>
            <p className="mt-2 text-lg font-semibold text-[#041E42]">{formatDate(abonado.fechaInicio)} · {formatDate(abonado.fechaTermino)}</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Información general</h2>
            <dl className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex justify-between gap-3"><dt>Empresa</dt><dd className="font-semibold text-slate-900">{empresa?.nombreFantasia || "No disponible"}</dd></div>
              <div className="flex justify-between gap-3"><dt>RUT</dt><dd className="font-semibold text-slate-900">{abonado.rut || "No disponible"}</dd></div>
              <div className="flex justify-between gap-3"><dt>Contrato</dt><dd className="font-semibold text-slate-900">{contrato?.numeroContrato || "No disponible"}</dd></div>
              <div className="flex justify-between gap-3"><dt>Estacionamientos autorizados</dt><dd className="font-semibold text-slate-900">{estacionamientos.map((item) => item.nombre).join(", ") || "No disponible"}</dd></div>
              <div className="flex justify-between gap-3"><dt>Patente principal</dt><dd className="font-semibold text-slate-900">{getPatentePrincipal(abonado) || "No disponible"}</dd></div>
            </dl>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Vehículos y credenciales</h2>
            <div className="mt-4 space-y-3">
              {vehiculos.map((vehiculo) => (
                <div key={vehiculo.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <p className="font-semibold text-[#041E42]">{vehiculo.licensePlate}</p>
                  <p className="mt-1">{vehiculo.brand || "Sin marca"} · {vehiculo.model || "Sin modelo"}</p>
                </div>
              ))}
              {credenciales.map((credencial) => (
                <div key={credencial.id} className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[#041E42]">{credencial.numero}</span>
                    <CredencialBadge tipo={credencial.tipo} estado={credencial.estado} />
                  </div>
                  <p className="mt-2">{credencial.observaciones}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[#041E42]">Permisos de acceso</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {permisos.map((permiso) => (
              <div key={permiso.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <p className="font-semibold text-[#041E42]">{permiso.id}</p>
                <p className="mt-2">{permiso.reglas}</p>
                <p className="mt-2">Accesos: {permiso.accesos.length ? permiso.accesos.join(", ") : "Sin accesos específicos"}</p>
                <p className="mt-2">Horario: {permiso.horarioDesde || "Sin horario"} - {permiso.horarioHasta || "Sin horario"}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
          <p className="font-semibold text-[#041E42]">Etapa futura</p>
          <p className="mt-2">Las secciones operativas adicionales de historial, auditoría, documentos y validaciones reales se incorporarán en futuras etapas sin ejecutar procesos reales de acceso ni credenciales.</p>
        </div>
      </div>
    </AppShell>
  );
}
