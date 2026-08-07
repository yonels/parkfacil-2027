"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil, Plus, TriangleAlert } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import EstacionamientoResumen from "./EstacionamientoResumen";
import EstadoEstacionamientoBadge from "./EstadoEstacionamientoBadge";
import TipoEstacionamientoBadge from "./TipoEstacionamientoBadge";
import ParkingStructureAdmin, { ParkingOperatorsPanel, structureCreateHref, structureCreateLabel } from "./ParkingStructureAdmin";
import ParkingRatesManager from "./ParkingRatesManager";
import { evaluateContractedCapacity, headerActionForTab, parkingDetailTabs } from "@/lib/parkingDetailView.mjs";
import { selectActiveRate } from "@/lib/parkingRates.mjs";

export default function EstacionamientoDetalleAdmin({ parking, structure, company }) {
  const [activeTab, setActiveTab] = useState("resumen");
  const [tarifaSignal, setTarifaSignal] = useState(0);
  const [contracted, setContracted] = useState(undefined); // undefined = cargando, null = no definido
  const [rates, setRates] = useState(undefined); // undefined = cargando

  useEffect(() => {
    if (!parking) return;
    let active = true;
    authenticatedFetch(`/api/estacionamientos/${parking.code}/plazas-contratadas`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!active) return;
        if (!response.ok) { setContracted(null); return; }
        setContracted(body.data);
      })
      .catch(() => { if (active) setContracted(null); });
    // Misma API que usa la pestaña Tarifas (parkingRatesRepository / parking_rates):
    // el indicador "Tarifa vigente" no crea ninguna consulta ni motor paralelo.
    authenticatedFetch(`/api/estacionamientos/${parking.code}/tarifas`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!active) return;
        setRates(response.ok ? (body.data || []) : []);
      })
      .catch(() => { if (active) setRates([]); });
    return () => { active = false; };
  }, [parking]);

  if (!parking) {
    return <AppShell title="Detalle de estacionamiento" description="Estacionamiento no encontrado"><div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center"><p className="text-lg font-semibold text-[#041E42]">No se encontró el estacionamiento solicitado.</p><Link href="/estacionamientos" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#3150D8]"><ArrowLeft className="h-4 w-4" /> Volver a estacionamientos</Link></div></AppShell>;
  }

  const metrics = structure?.metrics || parking.metrics;
  const onStreet = parking.type === "ON_STREET";
  const tabs = parkingDetailTabs(parking);

  const contractedSpaces = contracted === undefined ? undefined : (contracted?.contractedSpaces ?? null);
  const { overCapacity } = evaluateContractedCapacity(metrics.capacity, contractedSpaces);
  const activeRate = rates === undefined ? undefined : selectActiveRate(rates);

  const headerActions = [
    <Link key="volver" href="/estacionamientos" className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold"><ArrowLeft className="h-4 w-4" /> Volver</Link>,
    <Link key="editar" href={`/estacionamientos/${parking.code}/editar`} className="inline-flex items-center gap-2 rounded-full border border-[#DCE8FF] bg-[#F5F9FF] px-4 py-2 text-sm font-semibold text-[#3150D8]"><Pencil className="h-4 w-4" /> Editar estacionamiento</Link>,
  ];
  const contextualAction = headerActionForTab(activeTab);
  if (contextualAction === "estructura") {
    headerActions.push(<Link key="crear-estructura" href={structureCreateHref(parking)} className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> {structureCreateLabel(parking)}</Link>);
  } else if (contextualAction === "tarifas") {
    headerActions.push(<button key="crear-tarifa" type="button" onClick={() => setTarifaSignal((n) => n + 1)} className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Nueva tarifa</button>);
  }

  return <AppShell title={parking.name} description="Administración del estacionamiento"><div className="space-y-6">
    <PageHeader title={parking.name} description={`${parking.code} · ${parking.city}`} actions={headerActions} />

    <div className="flex flex-wrap gap-2"><EstadoEstacionamientoBadge status={parking.status} /><TipoEstacionamientoBadge type={parking.type} /></div>
    <nav aria-label="Secciones del estacionamiento" className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-3 text-sm font-semibold">
      {tabs.map((tab) => <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`shrink-0 rounded-full px-4 py-2 transition ${activeTab === tab.key ? "bg-[#F5F9FF] text-[#3150D8]" : "text-slate-600 hover:bg-slate-100"}`}>{tab.label}</button>)}
    </nav>

    {activeTab === "resumen" ? <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <EstacionamientoResumen
          title="Plazas contratadas"
          value={contracted === undefined ? "Cargando..." : (contractedSpaces == null ? "No definido" : contractedSpaces)}
          description={contractedSpaces == null && contracted !== undefined ? (company ? "Se administra desde el contrato de la empresa" : "Cantidad comercial contratada") : "Cantidad comercial contratada"}
          tone="info"
        />
        <EstacionamientoResumen title="Capacidad operativa" value={metrics.capacity} description={onStreet ? "Tramos activos" : "Zonas activas"} tone="info" />
        <EstacionamientoResumen title="Ocupadas" value={metrics.occupied} description="Unidades ocupadas" tone="warning" />
        <EstacionamientoResumen title="Disponibles" value={metrics.available} description="Capacidad libre" tone="positive" />
        <EstacionamientoResumen title="Ocupación" value={`${metrics.occupancyPercentage}%`} description="Sobre capacidad operativa" tone="neutral" />
        <EstacionamientoResumen
          title="Tarifa vigente"
          value={activeRate === undefined ? "Cargando..." : (activeRate ? activeRate.name : "Sin tarifa activa")}
          description={activeRate ? (activeRate.billingMode === "EFFECTIVE_MINUTE" ? "Minuto efectivo" : "Tramo vencido") : "Configure una tarifa activa"}
          tone={activeRate ? "positive" : "neutral"}
        />
      </div>
      {contractedSpaces == null && contracted !== undefined && company ? <p className="text-xs text-slate-500">Las plazas contratadas se definen en <Link href={`/empresas/${company.id}`} className="font-semibold text-[#3150D8] hover:underline">el contrato de {company.razonSocial}</Link>.</p> : null}
      {overCapacity ? <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" /><p>La capacidad operativa supera las plazas contratadas. Revise el contrato o la configuración del estacionamiento.</p></div> : null}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[#041E42]">Resumen</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Detail label="Empresa" value={company ? <Link href={`/empresas/${company.id}`} className="text-[#3150D8] hover:underline">{company.razonSocial}</Link> : parking.companyName} />
          <Detail label="Dirección" value={parking.address} />
          <Detail label="Ciudad y país" value={`${parking.city}, ${parking.country}`} />
          <Detail label="Horario" value={parking.schedule} />
          <Detail label="Tipo" value={onStreet ? "On Street" : "Off Street"} />
          <Detail label="Estado" value={parking.status === "ACTIVE" ? "Activo" : parking.status === "INACTIVE" ? "Inactivo" : "En mantenimiento"} />
          <Detail label={onStreet ? "Sectores" : "Niveles"} value={onStreet ? structure?.sectors?.length || 0 : structure?.levels?.length || 0} />
          <Detail label="Descripción" value={parking.description || "Sin observaciones"} />
        </div>
      </div>
      {company ? <section className="rounded-3xl border border-[#BFD2FF] bg-[#F5F9FF] p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-wider text-[#3150D8]">Empresa asociada</p><h2 className="mt-1 text-xl font-semibold text-[#041E42]">{company.razonSocial}</h2></div>
          <Link href={`/empresas/${company.id}`} className="rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white">Ver detalle de empresa</Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Detail label="RUT" value={`${company.rutNumero}-${company.rutDv}`} />
          <Detail label="Giro" value={company.giro} />
          <Detail label="Contacto" value={company.contactoPrincipal} />
          <Detail label="Correo" value={company.correo} />
          <Detail label="Teléfono" value={company.telefono} />
          <Detail label="Representante legal" value={company.representanteLegal} />
          <Detail label="Domicilio" value={`${company.direccion}, ${company.comuna}`} />
          <Detail label="Ciudad" value={`${company.ciudad}, ${company.pais}`} />
        </div>
      </section> : null}
    </section> : null}

    {activeTab === "estructura" ? <ParkingStructureAdmin parking={parking} structure={structure} /> : null}

    {activeTab === "tarifas" ? <ParkingRatesManager parking={parking} showCreateButton={false} openSignal={tarifaSignal} /> : null}

    {activeTab === "operadores" ? <ParkingOperatorsPanel parking={parking} /> : null}

    {activeTab === "infraestructura" ? <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-[#041E42]">Infraestructura</h2>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-300">
        <table className="w-full min-w-[560px] border-collapse text-left text-sm">
          <thead className="bg-[#E2F0D9] text-[#041E42]">
            <tr><th className="border-b border-r border-slate-300 px-4 py-3 font-semibold">Accesos declarados</th><th className="border-b border-slate-300 px-4 py-3 font-semibold">Salidas declaradas</th></tr>
          </thead>
          <tbody>
            <tr><td className="border-r border-slate-200 px-4 py-3 text-lg font-bold tabular-nums text-[#041E42]">{parking.accessCount}</td><td className="px-4 py-3 text-lg font-bold tabular-nums text-[#041E42]">{parking.exitCount}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-sm text-slate-500">Esta etapa administra cantidades declaradas; no integra barreras, sensores ni movimientos.</p>
    </section> : null}
  </div></AppShell>;
}

function Detail({ label, value }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 break-words font-semibold text-[#041E42]">{value || "—"}</p></div>;
}
