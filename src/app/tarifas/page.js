"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import TarifaResumen from "@/components/tarifas/TarifaResumen";
import TarifasGrid from "@/components/tarifas/TarifasGrid";
import PlanCreateModal from "@/components/tarifas/PlanCreateModal";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import {
  getTarifasDemo,
  hasImplementation,
  isCustomPlan,
  getEstadoLabel,
  getTipoLabel,
  getModalidadLabel,
} from "@/data/tarifas.mjs";

const demoTarifas = getTarifasDemo();
const estados = ["Todos", "active", "inactive", "draft", "archived"];
const tipos = ["Todos", "monthly_subscription", "per_transaction", "per_parking", "equipment_bundle", "implementation_only", "custom"];
const monedas = ["Todos", "CLP", "UF", "USD"];
const modalidades = ["Todos", "monthly", "annual", "one_time", "per_transaction", "mixed"];
const implementacion = ["Todos", "si", "no"];
const personalizados = ["Todos", "si", "no"];

export default function TarifasPage() {
  const [tarifas, setTarifas] = useState(demoTarifas);
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("Todos");
  const [tipo, setTipo] = useState("Todos");
  const [moneda, setMoneda] = useState("Todos");
  const [modalidad, setModalidad] = useState("Todos");
  const [conImplementacion, setConImplementacion] = useState("Todos");
  const [customizado, setCustomizado] = useState("Todos");

  useEffect(() => {
    let active = true;
    authenticatedFetch("/api/planes", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return null;
      const body = await response.json();
      if (active && Array.isArray(body.data)) setTarifas([...body.data, ...demoTarifas]);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const resultados = useMemo(() => {
    const query = busqueda.trim().toLowerCase();
    let base = tarifas.filter((tarifa) => [tarifa.nombre, tarifa.codigo, tarifa.tipo, tarifa.descripcion].some((value) => String(value || "").toLowerCase().includes(query)));

    if (estado !== "Todos") {
      base = base.filter((tarifa) => tarifa.estado === estado);
    }
    if (tipo !== "Todos") {
      base = base.filter((tarifa) => tarifa.tipo === tipo);
    }
    if (moneda !== "Todos") {
      base = base.filter((tarifa) => tarifa.moneda === moneda);
    }
    if (modalidad !== "Todos") {
      base = base.filter((tarifa) => tarifa.modalidadCobro === modalidad);
    }
    if (conImplementacion !== "Todos") {
      const include = conImplementacion === "si";
      base = base.filter((tarifa) => hasImplementation(tarifa) === include);
    }
    if (customizado !== "Todos") {
      const include = customizado === "si";
      base = base.filter((tarifa) => isCustomPlan(tarifa) === include);
    }

    return base;
  }, [tarifas, busqueda, estado, tipo, moneda, modalidad, conImplementacion, customizado]);

  const resumen = useMemo(() => tarifas.reduce((value, tarifa) => { value.total += 1; value[tarifa.estado] = (value[tarifa.estado] || 0) + 1; if (tarifa.tipo === "per_parking") value.porEstacionamiento += 1; if (tarifa.tipo === "per_transaction") value.porTransaccion += 1; if (isCustomPlan(tarifa)) value.personalizados += 1; return value; }, { total: 0, active: 0, inactive: 0, draft: 0, archived: 0, porEstacionamiento: 0, porTransaccion: 0, personalizados: 0 }), [tarifas]);

  return (
    <AppShell title="Tarifas y Planes" description="Administración visual de planes y condiciones comerciales demostrativas">
      <div className="space-y-6">
        <PageHeader
          title="Tarifas y Planes"
          description="Vista de referencia para la administración de planes, cargos y condiciones comerciales de ParkFacil, con datos demostrativos y estructura preparada para futuras etapas operativas."
          actions={[
            <PlanCreateModal key="nuevo" onCreated={(plan) => setTarifas((current) => [plan, ...current])} />,
          ]}
        />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <TarifaResumen title="Total de planes" value={resumen.total} description="Datos de referencia" tone="info" />
          <TarifaResumen title="Planes activos" value={resumen.active} description="Disponibles" tone="positive" />
          <TarifaResumen title="Planes inactivos" value={resumen.inactive} description="Sin vigencia" tone="warning" />
          <TarifaResumen title="Planes por estacionamiento" value={resumen.porEstacionamiento} description="Cobro por espacio" tone="neutral" />
          <TarifaResumen title="Planes por transacción" value={resumen.porTransaccion} description="Cobro transaccional" tone="warning" />
          <TarifaResumen title="Planes personalizados" value={resumen.personalizados} description="A medida" tone="neutral" />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-[#041E42]">Catálogo de planes</h3>
              <p className="mt-2 text-sm text-slate-600">Listado visual preparado para la administración comercial y contractual de ParkFacil.</p>
            </div>
            <StatusBadge variant="warning">Demostrativo</StatusBadge>
          </div>

          <div className="mt-6 space-y-4">
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
              <Search className="h-4 w-4 text-[#3150D8]" />
              <input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar por nombre, código, tipo o descripción" className="w-full bg-transparent outline-none" />
            </label>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <label className="space-y-2 text-sm text-slate-600">
                <span>Estado</span>
                <select value={estado} onChange={(event) => setEstado(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                  {estados.map((item) => <option key={item} value={item}>{item === "Todos" ? item : getEstadoLabel(item)}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-600">
                <span>Tipo</span>
                <select value={tipo} onChange={(event) => setTipo(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                  {tipos.map((item) => <option key={item} value={item}>{item === "Todos" ? item : getTipoLabel(item)}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-600">
                <span>Moneda</span>
                <select value={moneda} onChange={(event) => setMoneda(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                  {monedas.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-600">
                <span>Modalidad</span>
                <select value={modalidad} onChange={(event) => setModalidad(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                  {modalidades.map((item) => <option key={item} value={item}>{item === "Todos" ? item : getModalidadLabel(item)}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-600">
                <span>Con implementación</span>
                <select value={conImplementacion} onChange={(event) => setConImplementacion(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                  {implementacion.map((item) => <option key={item} value={item}>{item === "Todos" ? item : item === "si" ? "Sí" : "No"}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-600">
                <span>Personalizado</span>
                <select value={customizado} onChange={(event) => setCustomizado(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                  {personalizados.map((item) => <option key={item} value={item}>{item === "Todos" ? item : item === "si" ? "Sí" : "No"}</option>)}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-6">
            {resultados.length > 0 ? (
              <TarifasGrid tarifas={resultados} />
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
                No hay planes que coincidan con los filtros aplicados.
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
