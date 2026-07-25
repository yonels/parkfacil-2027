import AppShell from "@/components/layout/AppShell";
import EstadoConvenioBadge from "@/components/convenios/EstadoConvenioBadge";
import TipoConvenioBadge from "@/components/convenios/TipoConvenioBadge";
import ModalidadBeneficioBadge from "@/components/convenios/ModalidadBeneficioBadge";
import VigenciaConvenioBadge from "@/components/convenios/VigenciaConvenioBadge";
import BeneficiariosConvenioCard from "@/components/convenios/BeneficiariosConvenioCard";
import ReglasConvenioCard from "@/components/convenios/ReglasConvenioCard";
import UtilizacionConvenioCard from "@/components/convenios/UtilizacionConvenioCard";
import SimuladorConvenio from "@/components/convenios/SimuladorConvenio";
import {
  getConvenioById,
  calcularVigencia,
  calcularDiasRestantes,
  resolveEmpresaPrincipal,
  resolveEmpresasBeneficiarias,
  resolveEmpresaResponsable,
  resolveUsuarioResponsable,
  resolveEstacionamientos,
  resolveAccesos,
  resolveContrato,
  resolveTarifa,
  resolveAbonado,
  resolveVisita,
  resolveOperacion,
  getBeneficiarios,
  formatDate,
  formatHour,
  getTipoConvenioLabel,
  getModalidadBeneficioLabel,
  formatValorDemostrativo,
} from "@/data/convenios.mjs";

export const metadata = {
  title: "Detalle de convenio | ParkFacil",
  description: "Detalle visual de convenios y beneficios demostrativos.",
};

const referenceDate = "2026-07-25T10:15:00";

export default function ConvenioDetallePage({ params }) {
  const convenio = getConvenioById(params.id);

  if (!convenio) {
    return (
      <AppShell title="Convenios y Beneficios" description="Convenio no encontrado">
        <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-[#041E42]">Convenio no encontrado</h1>
          <p className="mt-2 text-sm text-slate-600">El identificador solicitado no existe en la muestra demostrativa.</p>
        </div>
      </AppShell>
    );
  }

  const vigencia = calcularVigencia(convenio, referenceDate);
  const diasRestantes = calcularDiasRestantes(convenio, referenceDate);
  const empresaPrincipal = resolveEmpresaPrincipal(convenio);
  const empresasBeneficiarias = resolveEmpresasBeneficiarias(convenio);
  const empresaResponsable = resolveEmpresaResponsable(convenio);
  const usuarioResponsable = resolveUsuarioResponsable(convenio);
  const estacionamientos = resolveEstacionamientos(convenio);
  const accesos = resolveAccesos(convenio);
  const contrato = resolveContrato(convenio);
  const tarifa = resolveTarifa(convenio);
  const beneficiarios = getBeneficiarios(convenio);
  const beneficiarioPrincipal = beneficiarios[0] || null;
  const abonadoRelacionado = resolveAbonado(convenio, beneficiarioPrincipal);
  const visitaRelacionada = resolveVisita(convenio, beneficiarioPrincipal);
  const operacionRelacionada = resolveOperacion(convenio);

  return (
    <AppShell title={convenio.codigo} description="Detalle visual de convenio demostrativo">
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#3150D8]">Detalle de convenio</p>
              <h1 className="mt-2 text-3xl font-semibold text-[#041E42]">{convenio.codigo}</h1>
              <p className="mt-2 text-sm text-slate-600">{convenio.nombre}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <TipoConvenioBadge tipo={convenio.tipo} />
              <EstadoConvenioBadge estado={convenio.estado} />
              <ModalidadBeneficioBadge modalidad={convenio.modalidadBeneficio} />
              <VigenciaConvenioBadge vigencia={vigencia.etiqueta} />
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Informacion general</h2>
            <dl className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex justify-between gap-3"><dt>Codigo</dt><dd className="font-semibold text-slate-900">{convenio.codigo}</dd></div>
              <div className="flex justify-between gap-3"><dt>Nombre</dt><dd className="font-semibold text-slate-900">{convenio.nombre}</dd></div>
              <div className="flex justify-between gap-3"><dt>Descripcion</dt><dd className="font-semibold text-slate-900">{convenio.descripcion}</dd></div>
              <div className="flex justify-between gap-3"><dt>Tipo</dt><dd className="font-semibold text-slate-900">{getTipoConvenioLabel(convenio.tipo)}</dd></div>
              <div className="flex justify-between gap-3"><dt>Estado</dt><dd className="font-semibold text-slate-900">{convenio.estado}</dd></div>
              <div className="flex justify-between gap-3"><dt>Modalidad</dt><dd className="font-semibold text-slate-900">{getModalidadBeneficioLabel(convenio.modalidadBeneficio)}</dd></div>
              <div className="flex justify-between gap-3"><dt>Prioridad</dt><dd className="font-semibold text-slate-900">{convenio.prioridad}</dd></div>
              <div className="flex justify-between gap-3"><dt>Responsable</dt><dd className="font-semibold text-slate-900">{usuarioResponsable?.nombreCompleto || "No disponible"}</dd></div>
              <div className="flex justify-between gap-3"><dt>Creacion demo</dt><dd className="font-semibold text-slate-900">{formatDate(convenio.fechaCreacionDemo)}</dd></div>
              <div className="flex justify-between gap-3"><dt>Actualizacion demo</dt><dd className="font-semibold text-slate-900">{formatDate(convenio.fechaActualizacionDemo)}</dd></div>
            </dl>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Beneficio</h2>
            <div className="mt-4">
              <ReglasConvenioCard convenio={convenio} />
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Vigencia</h2>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p><span className="font-semibold text-slate-900">Inicio:</span> {formatDate(convenio.vigencia.validFrom)}</p>
              <p><span className="font-semibold text-slate-900">Termino:</span> {formatDate(convenio.vigencia.validUntil)}</p>
              <p><span className="font-semibold text-slate-900">Dias habilitados:</span> {convenio.vigencia.allowedDays.join(", ") || "No disponible"}</p>
              <p><span className="font-semibold text-slate-900">Horario:</span> {formatHour(convenio.vigencia.startTime)} - {formatHour(convenio.vigencia.endTime)}</p>
              <p><span className="font-semibold text-slate-900">Feriados:</span> {convenio.vigencia.holidayPolicy || "No disponible"}</p>
              <p><span className="font-semibold text-slate-900">Exclusiones:</span> {convenio.vigencia.excludedDates.length ? convenio.vigencia.excludedDates.join(", ") : "No disponible"}</p>
              <p><span className="font-semibold text-slate-900">Renovacion:</span> {convenio.vigencia.automaticRenewal ? "Automatica" : "No automatica"}</p>
              <p><span className="font-semibold text-slate-900">Dias restantes:</span> {diasRestantes}</p>
              <p><span className="font-semibold text-slate-900">Etiqueta:</span> {vigencia.etiqueta}</p>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Empresas y referencias</h2>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p><span className="font-semibold text-slate-900">Empresa principal:</span> {empresaPrincipal?.nombreFantasia || "No disponible"}</p>
              <p><span className="font-semibold text-slate-900">Empresas beneficiarias:</span> {empresasBeneficiarias.length ? empresasBeneficiarias.map((item) => item.nombreFantasia).join(", ") : "No disponible"}</p>
              <p><span className="font-semibold text-slate-900">Empresa responsable:</span> {empresaResponsable?.nombreFantasia || "No disponible"}</p>
              <p><span className="font-semibold text-slate-900">Contrato relacionado:</span> {contrato?.numeroContrato || "No disponible"}</p>
              <p><span className="font-semibold text-slate-900">Tarifa relacionada:</span> {tarifa?.codigo || "No disponible"}</p>
              <p><span className="font-semibold text-slate-900">Abonado relacionado:</span> {abonadoRelacionado?.nombre || "No disponible"}</p>
              <p><span className="font-semibold text-slate-900">Visita relacionada:</span> {visitaRelacionada?.codigo || "No disponible"}</p>
              <p><span className="font-semibold text-slate-900">Operacion relacionada:</span> {operacionRelacionada?.ticketNumero || "No disponible"}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Estacionamientos y accesos</h2>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p><span className="font-semibold text-slate-900">Estacionamientos habilitados:</span> {estacionamientos.length ? estacionamientos.map((item) => item.nombre).join(", ") : "No disponible"}</p>
              <p><span className="font-semibold text-slate-900">Accesos:</span> {accesos.length ? accesos.map((item) => item.codigo).join(", ") : "No disponible"}</p>
              <p><span className="font-semibold text-slate-900">Zonas:</span> {convenio.zonas.length ? convenio.zonas.join(", ") : "No disponible"}</p>
              <p><span className="font-semibold text-slate-900">Restricciones:</span> {convenio.restriccionesEstacionamiento.length ? convenio.restriccionesEstacionamiento.join(" · ") : "No disponible"}</p>
              <p><span className="font-semibold text-slate-900">Cobertura:</span> {convenio.coberturaGlobal ? "Global" : "Especifica"}</p>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Beneficiarios</h2>
            <div className="mt-4">
              <BeneficiariosConvenioCard beneficiarios={beneficiarios} />
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Utilizacion</h2>
            <div className="mt-4">
              <UtilizacionConvenioCard convenio={convenio} />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Simulacion demostrativa</h2>
            <div className="mt-4">
              <SimuladorConvenio convenio={convenio} referenceDate={referenceDate} />
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Documentos, historial e incidencias</h2>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p><span className="font-semibold text-slate-900">Documentos:</span> {convenio.documentos.length ? convenio.documentos.join(" · ") : "Etapa futura"}</p>
              <p><span className="font-semibold text-slate-900">Historial:</span> {convenio.historial.length ? convenio.historial.join(" · ") : "Etapa futura"}</p>
              <p><span className="font-semibold text-slate-900">Incidencias:</span> {convenio.incidencias.length ? convenio.incidencias.join(" · ") : "Etapa futura"}</p>
              <p><span className="font-semibold text-slate-900">Auditoria:</span> {convenio.auditoria.length ? convenio.auditoria.join(" · ") : "Etapa futura"}</p>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#041E42]">Aprobaciones y comunicaciones</h2>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p><span className="font-semibold text-slate-900">Aprobaciones:</span> {convenio.aprobaciones.length ? convenio.aprobaciones.join(" · ") : "Etapa futura"}</p>
              <p><span className="font-semibold text-slate-900">Comunicaciones:</span> {convenio.comunicaciones.length ? convenio.comunicaciones.join(" · ") : "Etapa futura"}</p>
              <p><span className="font-semibold text-slate-900">Estadisticas avanzadas:</span> Etapa futura</p>
              <p><span className="font-semibold text-slate-900">Integraciones:</span> Etapa futura</p>
              <p><span className="font-semibold text-slate-900">Consumo acumulado:</span> {formatValorDemostrativo(convenio.utilizacion.accumulatedDiscount || 0)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
          <p className="font-semibold text-[#041E42]">Etapa futura</p>
          <p className="mt-2">No se implementan cobros reales, descuentos productivos, facturacion, POS, APIs, Supabase, QR funcional, LPR, barreras ni validaciones operativas reales.</p>
        </div>
      </div>
    </AppShell>
  );
}
