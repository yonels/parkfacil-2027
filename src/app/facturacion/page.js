"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Banknote, ClipboardList, BarChart3, CircleDollarSign, FileCheck2, FileMinus2, FilePlus2, FileSearch, Workflow, HandCoins, ReceiptText, RefreshCcw, Settings2, WalletCards } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import ParkFacilDataGrid from "@/components/ui/ParkFacilDataGrid";
import PreinvoiceWorkspace from "@/components/billing/PreinvoiceWorkspace";
import AccountWorkspace from "@/components/billing/AccountWorkspace";
import ReconciliationWorkspace from "@/components/billing/ReconciliationWorkspace";
import DocumentWorkspace from "@/components/billing/DocumentWorkspace";
import DocumentJobPanel from "@/components/billing/DocumentJobPanel";
import CatalogWorkspace from "@/components/billing/CatalogWorkspace";
import BillingSettingsWorkspace from "@/components/billing/BillingSettingsWorkspace";
import CompanyServicesWorkspace from "@/components/billing/CompanyServicesWorkspace";
import IssuedDocumentsWorkspace from "@/components/billing/IssuedDocumentsWorkspace";
import BillingCycleWorkspace from "@/components/billing/BillingCycleWorkspace";
import { forgetCycleReturn, readCycleReturn } from "@/components/billing/cycleReturnStore";

const column = (key, label, width = 150, pinned = false) => ({ key, label, width, pinned, required: pinned });

const summaryCards = [
  { title: "Facturación del mes", icon: ReceiptText },
  { title: "Por emitir", icon: FilePlus2 },
  { title: "Pendiente de pago", icon: HandCoins },
  { title: "Vencido", icon: CircleDollarSign },
];

const moduleCards = [
  {
    id: "ciclo", group: "operacion", title: "Ciclo de facturación", description: "Cada empresa avanza por etapas hasta emitir y enviar su factura del mes. Incluye facturar en lote.", icon: Workflow,
    columns: [],
  },
  {
    id: "servicios", group: "operacion", title: "Servicios a facturar", description: "Servicios y productos del catálogo asignados a cada empresa.", icon: ClipboardList,
    columns: [],
  },
  {
    id: "prefacturacion", group: "operacion", title: "Prefacturación", description: "Preparación y revisión previa de documentos.", icon: FileCheck2,
    columns: [column("prefactura", "Prefactura", 140, true), column("cliente", "Cliente", 220), column("rut", "RUT", 140), column("contrato", "Contrato", 150), column("periodo", "Período", 130), column("moneda", "Moneda", 110), column("neto", "Neto", 130), column("impuesto", "Impuesto", 130), column("total", "Total", 130), column("estado", "Estado", 140), column("fechaCalculo", "Fecha cálculo", 150), column("vencimiento", "Vencimiento estimado", 170)],
  },
  {
    id: "facturas", group: "operacion", title: "Facturas", description: "Consulta y administración de facturas emitidas.", icon: ReceiptText,
    columns: [column("tipoDocumento", "Tipo documento", 160, true), column("folio", "Folio", 110), column("cliente", "Cliente", 220), column("rut", "RUT", 140), column("periodo", "Período", 130), column("fechaEmision", "Fecha emisión", 150), column("fechaVencimiento", "Fecha vencimiento", 170), column("neto", "Neto", 130), column("impuesto", "Impuesto", 130), column("total", "Total", 130), column("estado", "Estado", 140), column("saldo", "Saldo", 130), column("proveedor", "Proveedor", 180)],
  },
  {
    id: "notas-credito", group: "operacion", title: "Notas de Crédito", description: "Gestión de documentos de ajuste por crédito.", icon: FileMinus2,
    columns: [column("folioNc", "Folio NC", 130, true), column("facturaRelacionada", "Factura relacionada", 180), column("cliente", "Cliente", 220), column("fecha", "Fecha", 130), column("motivo", "Motivo", 240), column("neto", "Neto", 130), column("impuesto", "Impuesto", 130), column("total", "Total", 130), column("estado", "Estado", 140)],
  },
  {
    id: "notas-debito", group: "operacion", title: "Notas de Débito", description: "Gestión de documentos de ajuste por débito.", icon: FilePlus2,
    columns: [column("folioNd", "Folio ND", 130, true), column("facturaRelacionada", "Factura relacionada", 180), column("cliente", "Cliente", 220), column("fecha", "Fecha", 130), column("motivo", "Motivo", 240), column("neto", "Neto", 130), column("impuesto", "Impuesto", 130), column("total", "Total", 130), column("estado", "Estado", 140)],
  },
  {
    id: "documentos-emitidos", group: "operacion", title: "Documentos SII", description: "Facturas y notas registradas en el SII, de cualquier origen: ParkFacil, EasyDoc, Registro de Ventas del SII y Haulmer.", icon: FileSearch,
    columns: [],
  },
  {
    id: "cuenta-corriente", group: "cartera", title: "Cuenta Corriente", description: "Saldos y movimientos comerciales por cliente.", icon: WalletCards,
    columns: [column("fecha", "Fecha", 130, true), column("cliente", "Cliente", 220), column("documento", "Documento", 160), column("referencia", "Referencia", 170), column("vencimiento", "Vencimiento", 150), column("debe", "Debe", 130), column("haber", "Haber", 130), column("saldo", "Saldo", 130), column("estado", "Estado", 140)],
  },
  {
    id: "pagos", group: "cartera", title: "Pagos", description: "Registro y seguimiento de pagos asociados.", icon: Banknote,
    columns: [column("fecha", "Fecha", 130, true), column("cliente", "Cliente", 220), column("referencia", "Referencia", 170), column("medioPago", "Medio de pago", 160), column("monto", "Monto", 130), column("documentoAsociado", "Documento asociado", 190), column("estado", "Estado", 140), column("conciliado", "Conciliado", 130)],
  },
  {
    id: "cobranza", group: "cartera", title: "Cobranza", description: "Seguimiento de obligaciones pendientes y vencidas.", icon: HandCoins,
    columns: [column("cliente", "Cliente", 220, true), column("rut", "RUT", 140), column("documento", "Documento", 160), column("fechaEmision", "Fecha emisión", 150), column("vencimiento", "Vencimiento", 150), column("total", "Total", 130), column("pagado", "Pagado", 130), column("saldo", "Saldo", 130), column("diasVencidos", "Días vencidos", 140), column("estado", "Estado", 140)],
  },
  {
    id: "conciliacion", group: "cartera", title: "Conciliación", description: "Comparación futura entre documentos y pagos.", icon: RefreshCcw,
    columns: [column("fecha", "Fecha", 130, true), column("cliente", "Cliente", 220), column("pago", "Pago", 160), column("documento", "Documento", 160), column("montoPago", "Monto pago", 140), column("montoAplicado", "Monto aplicado", 150), column("diferencia", "Diferencia", 130), column("estado", "Estado", 140)],
  },
  {
    id: "reportes", group: "analisis", title: "Reportes", description: "Análisis de facturación, cartera, pagos y comportamiento comercial.", icon: BarChart3,
    columns: [column("periodo", "Período", 130, true), column("cliente", "Cliente", 220), column("facturado", "Facturado", 140), column("notasCredito", "Notas de Crédito", 160), column("pagado", "Pagado", 130), column("pendiente", "Pendiente", 140), column("vencido", "Vencido", 130), column("saldo", "Saldo", 130)],
  },
  {
    id: "configuracion", group: "administracion", title: "Configuración", description: "Datos del emisor, vencimiento, proveedor de emisión y catálogo de servicios y productos.", icon: Settings2,
    columns: [column("parametro", "Parámetro", 260, true), column("categoria", "Categoría", 190), column("valor", "Valor", 240), column("descripcion", "Descripción", 360), column("estado", "Estado", 140), column("actualizado", "Última actualización", 180)],
  },
];

const groups = [
  { id: "operacion", title: "Operación", description: "Calcular · revisar · facturar" },
  { id: "cartera", title: "Cartera", description: "Cobrar · conciliar" },
  { id: "analisis", title: "Análisis", description: "Analizar" },
  { id: "administracion", title: "Administración", description: "Parámetros comerciales ParkFacil" },
];

export default function FacturacionPage() {
  const [activeModuleId, setActiveModuleId] = useState(null);
  const activeModule = useMemo(() => moduleCards.find((module) => module.id === activeModuleId) || null, [activeModuleId]);

  useEffect(() => {
    const selectFromHash = () => {
      const requestedId = window.location.hash.slice(1);
      setActiveModuleId(moduleCards.some((module) => module.id === requestedId) ? requestedId : null);
    };
    selectFromHash();
    // El menú lateral navega con el enrutador de Next (history.pushState), que cambia el «#» sin
    // disparar hashchange: se toma la sección del propio enlace clicado (/facturacion#…).
    // (SOL-2026-11-05-005). hashchange y popstate cubren escritura manual y botones Atrás/Adelante.
    const onLinkClick = (event) => {
      const link = event.target?.closest?.('a[href^="/facturacion#"]');
      if (!link) return;
      const requestedId = new URL(link.href).hash.slice(1);
      setActiveModuleId(moduleCards.some((module) => module.id === requestedId) ? requestedId : null);
    };
    window.addEventListener("hashchange", selectFromHash);
    window.addEventListener("popstate", selectFromHash);
    document.addEventListener("click", onLinkClick);
    return () => {
      window.removeEventListener("hashchange", selectFromHash);
      window.removeEventListener("popstate", selectFromHash);
      document.removeEventListener("click", onLinkClick);
    };
  }, []);

  // F2: el aviso refleja el proveedor y ambiente elegidos en Configuración.
  const [emission, setEmission] = useState(null);
  useEffect(() => {
    let active = true;
    fetch("/api/billing/settings", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((payload) => { if (active && payload?.data) setEmission({ provider: payload.data.invoiceProvider, environment: payload.data.providerEnvironment }); }).catch(() => {});
    return () => { active = false; };
  }, [activeModuleId]);

  // Barra «Volver al ciclo» en las pantallas de detalle abiertas desde una etapa del ciclo (SOL-2026-11-05-005).
  const [returnDismissed, setReturnDismissed] = useState(0);
  const cycleReturn = useMemo(() => (activeModule && activeModule.id !== "ciclo" && typeof window !== "undefined" ? readCycleReturn() : null), [activeModule, returnDismissed]); // eslint-disable-line react-hooks/exhaustive-deps

  const openModule = (moduleId) => {
    window.history.replaceState(null, "", `/facturacion#${moduleId}`);
    setActiveModuleId(moduleId);
  };

  const closeModule = () => {
    window.history.replaceState(null, "", "/facturacion");
    setActiveModuleId(null);
  };

  return (
    <AppShell title="Facturación" description="Gestión comercial y documental de clientes" onBack={activeModule ? closeModule : undefined}>
      <div className="space-y-6">
        <PageHeader title="Facturación" description="Gestión comercial, prefacturación, documentos, cuenta corriente y cobranza." eyebrow="BACKOFFICE PARKFACIL" />

        {emission?.provider === "HAULMER" && emission?.environment === "PRODUCTION" ? (
          <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <span className="font-semibold">Emisión real con Haulmer.</span> Las facturas y notas se envían al SII con validez tributaria.
          </div>
        ) : emission?.provider === "HAULMER" ? (
          <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="font-semibold">Haulmer, ambiente de pruebas.</span> Los documentos se emiten en el ambiente de desarrollo de Haulmer a nombre de su empresa de prueba (HAULMER SPA) y no tienen validez tributaria.
          </div>
        ) : (
          <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="font-semibold">Modo simulado.</span> La emisión de facturas y notas usa un proveedor de prueba: los documentos no se envían al SII y no tienen validez tributaria.
          </div>
        )}

        {!activeModule ? (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumen de facturación">
              {summaryCards.map(({ title, icon: Icon }) => (
                <article key={title} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-slate-500">{title}</p><p className="mt-3 text-xl font-bold text-[#041E42]">Sin datos</p></div><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#EEF4FF] text-[#3150D8]"><Icon className="h-5 w-5" /></span></div>
                  <p className="mt-3 text-xs text-slate-500">Pendiente de implementación</p>
                </article>
              ))}
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-semibold text-[#041E42]">Áreas de Facturación</h2><p className="mt-2 text-sm text-slate-600">Calcular → revisar → facturar → cobrar → conciliar → analizar.</p></div><span className="w-fit rounded-full border border-[#BFD2FF] bg-[#EEF4FF] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#3150D8]">Etapa 0</span></div>
              <div className="mt-7 space-y-8">
                {groups.map((group) => (
                  <section key={group.id} aria-labelledby={`facturacion-${group.id}`}>
                    <div className="mb-3 flex items-baseline gap-3 border-b border-slate-100 pb-2"><h3 id={`facturacion-${group.id}`} className="text-xs font-bold uppercase tracking-[0.2em] text-[#3150D8]">{group.title}</h3><p className="text-xs text-slate-500">{group.description}</p></div>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      {moduleCards.filter((module) => module.group === group.id).map(({ id, title, description, icon: Icon }) => (
                        <button key={id} type="button" onClick={() => openModule(id)} className="flex min-h-44 flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#3150D8] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#3150D8]">
                          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#EEF4FF] text-[#3150D8]"><Icon className="h-5 w-5" /></span><h4 className="mt-4 font-semibold text-[#041E42]">{title}</h4><p className="mt-2 flex-1 text-sm leading-5 text-slate-600">{description}</p><span className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-[#3150D8]">Abrir planilla</span>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </section>
          </>
        ) : (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#3150D8]">Planilla de Facturación</p><h2 className="mt-1 text-2xl font-bold text-[#041E42]">{activeModule.title}</h2><p className="mt-1 text-sm text-slate-600">{activeModule.description}</p></div><button type="button" onClick={closeModule} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#041E42] shadow-sm hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /> Volver a Facturación</button></div>
            {cycleReturn ? (
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
                <button type="button" onClick={() => openModule("ciclo")} className="rounded-full bg-[#3150D8] px-4 py-1.5 font-bold text-white shadow-sm">← Volver al ciclo</button>
                <span><b>{cycleReturn.companyName}</b> · Etapa {cycleReturn.stepN}: {cycleReturn.stepShort}. Cuando termine aquí, vuelva para continuar con la etapa siguiente.</span>
                <button type="button" onClick={() => { forgetCycleReturn(); setReturnDismissed((n) => n + 1); }} className="ml-auto text-indigo-500 hover:text-indigo-800" aria-label="Cerrar">✕</button>
              </div>
            ) : null}
            {activeModule.id === "prefacturacion" ? <PreinvoiceWorkspace columns={activeModule.columns} /> : activeModule.id === "cuenta-corriente" ? <AccountWorkspace columns={activeModule.columns} /> : activeModule.id === "conciliacion" ? <ReconciliationWorkspace /> : activeModule.id === "facturas" ? <><DocumentJobPanel /><DocumentWorkspace type="INVOICE" /></> : activeModule.id === "notas-credito" ? <DocumentWorkspace type="CREDIT_NOTE" /> : activeModule.id === "notas-debito" ? <DocumentWorkspace type="DEBIT_NOTE" /> : activeModule.id === "configuracion" ? <div className="space-y-6"><BillingSettingsWorkspace /><CatalogWorkspace /></div> : activeModule.id === "servicios" ? <CompanyServicesWorkspace /> : activeModule.id === "documentos-emitidos" ? <IssuedDocumentsWorkspace /> : activeModule.id === "ciclo" ? <BillingCycleWorkspace /> : <ParkFacilDataGrid storageKey={`facturacion:${activeModule.id}`} columns={activeModule.columns} rows={[]} globalSearchPlaceholder={`Buscar en ${activeModule.title.toLowerCase()}...`} emptyMessage="Sin registros" exportFilename={`facturacion_${activeModule.id}`} exportSheetName={activeModule.title} />}
          </section>
        )}
      </div>
    </AppShell>
  );
}
