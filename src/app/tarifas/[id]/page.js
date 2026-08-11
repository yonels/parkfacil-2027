import Link from "next/link";
import { ArrowLeft, BadgeDollarSign, Boxes, Building2, FileText, HardHat, MonitorSmartphone, Sparkles, Wrench } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import EstadoTarifaBadge from "@/components/tarifas/EstadoTarifaBadge";
import TipoTarifaBadge from "@/components/tarifas/TipoTarifaBadge";
import ModalidadCobroBadge from "@/components/tarifas/ModalidadCobroBadge";
import { getTarifaById, formatCurrency, resolveContratos, getPlanTotalReferencial } from "@/data/tarifas.mjs";
import { getCommercialPlanAssignments, getCommercialPlanPageData } from "@/lib/commercialPlansServer";

function DetailItem({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-base font-semibold text-[#041E42]">{value}</p>
    </div>
  );
}

export default async function TarifaDetallePage({ params }) {
  const { id } = await params;
  const tarifa = getTarifaById(id) || await getCommercialPlanPageData(id);

  if (!tarifa) {
    return (
      <AppShell title="Detalle de plan" description="Plan no encontrado">
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-lg font-semibold text-[#041E42]">No se encontró el plan solicitado.</p>
          <Link href="/tarifas" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#3150D8]">
            <ArrowLeft className="h-4 w-4" /> Volver al catálogo
          </Link>
        </div>
      </AppShell>
    );
  }

  const contratos = resolveContratos(tarifa);
  const asignaciones = await getCommercialPlanAssignments(tarifa.id || tarifa.codigo);

  return (
    <AppShell title={tarifa.nombre} description="Detalle visual del plan comercial">
      <div className="space-y-6">
        <PageHeader
          title={tarifa.nombre}
          description={`${tarifa.codigo} · ${tarifa.descripcion}`}
          actions={[
            <Link key="volver" href="/tarifas" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#3150D8] hover:text-[#3150D8]">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Link>,
          ]}
        />

        <section className="grid gap-4 lg:grid-cols-[1.25fr_0.8fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <EstadoTarifaBadge estado={tarifa.estado} />
              <TipoTarifaBadge tipo={tarifa.tipo} />
              <ModalidadCobroBadge modalidad={tarifa.modalidadCobro} />
            </div>
            <h3 className="mt-5 text-2xl font-semibold text-[#041E42]">Información general</h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">{tarifa.observaciones}</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <DetailItem label="Código" value={tarifa.codigo} />
              <DetailItem label="Moneda" value={tarifa.moneda} />
              <DetailItem label="Estado" value={tarifa.estado} />
              <DetailItem label="Vigencia comercial" value={tarifa.vigencia} />
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-[#F5F9FF] p-6 shadow-sm">
            <div className="flex items-center gap-2 text-[#3150D8]"><BadgeDollarSign className="h-5 w-5" /><h3 className="text-lg font-semibold">Cargos principales</h3></div>
            <div className="mt-6 space-y-3 text-sm text-slate-600">
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3"><span>Cargo mensual</span><strong>{formatCurrency(tarifa.monthlyFee, tarifa.moneda)}</strong></div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3"><span>Cargo anual</span><strong>{formatCurrency(tarifa.annualFee, tarifa.moneda)}</strong></div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3"><span>Implementación</span><strong>{formatCurrency(tarifa.implementationFee, tarifa.moneda)}</strong></div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3"><span>Total referencial</span><strong>{formatCurrency(getPlanTotalReferencial(tarifa), tarifa.moneda)}</strong></div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-[#041E42]">Descuentos y condiciones</h3>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DetailItem label="Descuento demostrativo" value={`${tarifa.discountPercentage}%`} />
            <DetailItem label="Cobro mínimo mensual" value={formatCurrency(tarifa.minimumMonthlyCharge, tarifa.moneda)} />
            <DetailItem label="Cargo por transacción" value={formatCurrency(tarifa.transactionFee, tarifa.moneda)} />
            <DetailItem label="Cargo por dispositivo" value={formatCurrency(tarifa.deviceFee, tarifa.moneda)} />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-[#041E42]">Componentes del plan</h3>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-[#3150D8]"><MonitorSmartphone className="h-5 w-5" /><h4 className="font-semibold">Módulos incluidos</h4></div>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {tarifa.modulos.map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-[#3150D8]"><Boxes className="h-5 w-5" /><h4 className="font-semibold">Equipamiento incluido</h4></div>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {tarifa.equipamiento.map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-[#041E42]">Soporte, implementación y límites</h3>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-[#3150D8]"><Wrench className="h-5 w-5" /><h4 className="font-semibold">Implementación</h4></div>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {tarifa.implementacion.map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-[#3150D8]"><Sparkles className="h-5 w-5" /><h4 className="font-semibold">Límites y condiciones</h4></div>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {tarifa.limites.map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-[#041E42]">Asignaciones</h3>
          {asignaciones.length ? <div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b"><th className="p-3">Empresa</th><th className="p-3">Contrato</th><th className="p-3">Estacionamiento</th><th className="p-3">Versión</th><th className="p-3">Vigencia</th><th className="p-3">Estado</th></tr></thead><tbody>{asignaciones.map((a,index)=><tr key={`${a.contractId}:${a.parking?.id||index}`} className="border-b"><td className="p-3"><Link className="font-semibold text-[#3150D8]" href={`/empresas/${a.company?.id}`}>{a.company?.business_name}</Link></td><td className="p-3"><Link className="text-[#3150D8]" href={`/contratos/${a.contractId}`}>{a.contractNumber}</Link></td><td className="p-3">{a.parking?.name||"Sin estacionamiento"}</td><td className="p-3">v{a.version?.version}</td><td className="p-3">{a.startsOn} → {a.endsOn}</td><td className="p-3">{a.contractStatus}</td></tr>)}</tbody></table></div> : <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">Plan de catálogo sin asignación activa</p>}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-[#041E42]">Relaciones y seguimiento</h3>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-[#3150D8]"><Building2 className="h-5 w-5" /><h4 className="font-semibold">Contratos asociados</h4></div>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {contratos.length > 0 ? contratos.map((item) => <li key={item.id}>• {item.numeroContrato}</li>) : <li>• No disponible</li>}
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-[#3150D8]"><FileText className="h-5 w-5" /><h4 className="font-semibold">Historial</h4></div>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>• {tarifa.fechaCreacion}</li>
                <li>• {tarifa.observaciones}</li>
              </ul>
            </div>
          </div>
          <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
            <p className="font-semibold text-[#041E42]">Etapa futura</p>
            <p className="mt-2">Las acciones reales de contratación, activación, cotización y facturación se incorporarán en futuras etapas sin ejecutar procesos comerciales reales.</p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
