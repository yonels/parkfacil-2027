import Link from "next/link";
import { ArrowLeft, Building2, CalendarRange, FileText, Handshake, ListChecks, ShieldCheck, UserRound, BadgeDollarSign, History } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import EstadoContratoBadge from "@/components/contratos/EstadoContratoBadge";
import TipoContratoBadge from "@/components/contratos/TipoContratoBadge";
import VigenciaContratoBadge from "@/components/contratos/VigenciaContratoBadge";
import { getContratoById, calcularDuracionMeses, calcularVigencia, formatCurrency, resolveEmpresa, resolveEstacionamientos, resolveResponsable } from "@/data/contratos.mjs";

function DetailItem({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-base font-semibold text-[#041E42]">{value}</p>
    </div>
  );
}

export default async function ContratoDetallePage({ params }) {
  const resolvedParams = typeof params?.then === "function" ? await params : params;
  const routeId = decodeURIComponent(String(resolvedParams?.id || "")).trim();
  const contrato = getContratoById(routeId);

  if (!contrato) {
    return (
      <AppShell title="Detalle de contrato" description="Contrato no encontrado">
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-lg font-semibold text-[#041E42]">No se encontró el contrato solicitado.</p>
          <Link href="/contratos" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#3150D8]">
            <ArrowLeft className="h-4 w-4" /> Volver al catálogo
          </Link>
        </div>
      </AppShell>
    );
  }

  const empresa = resolveEmpresa(contrato);
  const estacionamientos = resolveEstacionamientos(contrato);
  const responsable = resolveResponsable(contrato);
  const vigencia = calcularVigencia(contrato, new Date("2026-01-15"));
  const duracion = calcularDuracionMeses(contrato.fechaInicio, contrato.fechaTermino);
  const documentos = (contrato.documentos || []).map((item, index) => {
    if (typeof item === "string") {
      return {
        id: `doc-${index}`,
        nombre: item,
        url: null,
      };
    }

    return {
      id: item?.id || `doc-${index}`,
      nombre: item?.nombre || item?.name || `Documento ${index + 1}`,
      url: item?.url || null,
    };
  });
  const pdfDocumento = documentos.find((item) => {
    const nombre = String(item.nombre || "").toLowerCase();
    const url = String(item.url || "").toLowerCase();
    return Boolean(item.url) && (nombre.endsWith(".pdf") || url.includes(".pdf"));
  }) || null;

  return (
    <AppShell title={contrato.numeroContrato} description="Detalle visual del contrato">
      <div className="space-y-6">
        <PageHeader
          title={contrato.numeroContrato}
          description={`${empresa?.razonSocial || "No disponible"} · ${contrato.observaciones}`}
          actions={[
            <Link key="volver" href="/contratos" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#3150D8] hover:text-[#3150D8]">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Link>,
          ]}
        />

        <section className="grid gap-4 lg:grid-cols-[1.3fr_0.8fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <EstadoContratoBadge estado={contrato.estado} />
              <TipoContratoBadge tipo={contrato.tipo} />
              <VigenciaContratoBadge vigencia={vigencia} />
            </div>
            <h3 className="mt-5 text-2xl font-semibold text-[#041E42]">Información general</h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">{contrato.alcance}</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <DetailItem label="Empresa asociada" value={empresa?.razonSocial || "No disponible"} />
              <DetailItem label="Responsable" value={responsable} />
              <DetailItem label="Fecha de inicio" value={contrato.fechaInicio} />
              <DetailItem label="Fecha de término" value={contrato.fechaTermino} />
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-[#F5F9FF] p-6 shadow-sm">
            <div className="flex items-center gap-2 text-[#3150D8]"><BadgeDollarSign className="h-5 w-5" /><h3 className="text-lg font-semibold">Resumen financiero</h3></div>
            <div className="mt-6 space-y-3 text-sm text-slate-600">
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3"><span>Moneda</span><strong>{contrato.currency}</strong></div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3"><span>Valor mensual</span><strong>{formatCurrency(contrato.monthlyValue, contrato.currency)}</strong></div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3"><span>Valor implementación</span><strong>{formatCurrency(contrato.implementationValue, contrato.currency)}</strong></div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3"><span>Valor total referencia</span><strong>{formatCurrency(contrato.totalReferenceValue, contrato.currency)}</strong></div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-[#041E42]">Vigencia y alcance</h3>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DetailItem label="Duración" value={`${duracion} meses`} />
            <DetailItem label="Renovación automática" value={contrato.renovacionAutomatica ? "Sí" : "No"} />
            <DetailItem label="Aviso previo" value={`${contrato.avisoPreviaNoRenovacion} días`} />
            <DetailItem label="Días restantes" value={`${vigencia.diasRestantes} días`} />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-[#041E42]">Relaciones y participantes</h3>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-[#3150D8]"><Building2 className="h-5 w-5" /><h4 className="font-semibold">Estacionamientos</h4></div>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {estacionamientos.length > 0 ? estacionamientos.map((item) => <li key={item.id}>• {item.nombre}</li>) : <li>• No disponible</li>}
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-[#3150D8]"><UserRound className="h-5 w-5" /><h4 className="font-semibold">Contactos</h4></div>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {contrato.contactos.length > 0 ? contrato.contactos.map((item) => <li key={item}>• {item}</li>) : <li>• No disponible</li>}
              </ul>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-[#041E42]">Alcance contractual</h3>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-[#3150D8]"><ListChecks className="h-5 w-5" /><h4 className="font-semibold">Servicios incluidos</h4></div>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {contrato.serviciosIncluidos.map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-[#3150D8]"><ShieldCheck className="h-5 w-5" /><h4 className="font-semibold">Equipamiento</h4></div>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {contrato.equipamiento.length > 0 ? contrato.equipamiento.map((item) => <li key={item}>• {item}</li>) : <li>• No disponible</li>}
              </ul>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-[#041E42]">Documentación y seguimiento</h3>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-[#3150D8]"><FileText className="h-5 w-5" /><h4 className="font-semibold">Documentos</h4></div>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {documentos.length > 0 ? documentos.map((item) => (
                  <li key={item.id} className="space-y-1">
                    <p>• {item.nombre}</p>
                    {item.url ? (
                      <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg bg-white px-2.5 py-1 font-mono text-xs text-[#3150D8] underline-offset-2 hover:underline">
                        {item.url}
                      </a>
                    ) : null}
                  </li>
                )) : <li>• No disponible</li>}
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-[#3150D8]"><History className="h-5 w-5" /><h4 className="font-semibold">Historial</h4></div>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {contrato.historial.map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </div>
          </div>
          {pdfDocumento ? (
            <p className="mt-6 text-sm text-slate-600">
              Haz click en la ruta del PDF para abrir el documento en una nueva pestaña.
            </p>
          ) : null}
          <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
            <p className="font-semibold text-[#041E42]">Etapa futura</p>
            <p className="mt-2">Las acciones operativas reales, firma electrónica, generación de PDFs y administración contractual se incorporarán en futuras etapas sin ejecutar procesos reales.</p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
