"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import ContratoResumen from "@/components/contratos/ContratoResumen";
import ContratosGrid from "@/components/contratos/ContratosGrid";
import {
  getContratosDemo,
  searchContratos,
  filterContratosByEstado,
  filterContratosByTipo,
  filterContratosByEmpresa,
  filterContratosByEstacionamiento,
  filterContratosByMoneda,
  filterContratosByRenovacionAutomatica,
  filterContratosProximosAVencer,
  getResumenContratos,
  getEstadoLabel,
  getTipoLabel,
} from "@/data/contratos.mjs";

const contratos = getContratosDemo();
const estados = ["Todos", "draft", "under_review", "pending_signature", "signed", "active", "suspended", "expired", "terminated", "cancelled"];
const tipos = ["Todos", "software_service", "parking_operation", "equipment_lease", "support_service", "implementation", "partnership", "other"];
const empresas = ["Todos", ...new Set(contratos.map((contrato) => contrato.empresaId))];
const estacionamientos = ["Todos", ...new Set(contratos.flatMap((contrato) => contrato.estacionamientos))];
const monedas = ["Todos", "CLP", "UF", "USD"];
const renovacion = ["Todos", "si", "no"];
const proximos = ["Todos", "si", "no"];

export default function ContratosPage() {
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("Todos");
  const [tipo, setTipo] = useState("Todos");
  const [empresaId, setEmpresaId] = useState("Todos");
  const [estacionamientoId, setEstacionamientoId] = useState("Todos");
  const [moneda, setMoneda] = useState("Todos");
  const [renovacionAutomatica, setRenovacionAutomatica] = useState("Todos");
  const [proximosAVencer, setProximosAVencer] = useState("Todos");

  const resultados = useMemo(() => {
    let base = searchContratos(busqueda);

    if (estado !== "Todos") {
      base = filterContratosByEstado(estado);
    }

    if (tipo !== "Todos") {
      base = base.filter((contrato) => contrato.tipo === tipo);
    }

    if (empresaId !== "Todos") {
      base = base.filter((contrato) => contrato.empresaId === empresaId);
    }

    if (estacionamientoId !== "Todos") {
      base = base.filter((contrato) => contrato.estacionamientos.includes(estacionamientoId));
    }

    if (moneda !== "Todos") {
      base = base.filter((contrato) => contrato.currency === moneda);
    }

    if (renovacionAutomatica !== "Todos") {
      const valor = renovacionAutomatica === "si";
      base = base.filter((contrato) => contrato.renovacionAutomatica === valor);
    }

    if (proximosAVencer !== "Todos") {
      const target = proximosAVencer === "si";
      const filtrados = filterContratosProximosAVencer(new Date("2026-01-15"));
      base = target ? base.filter((contrato) => filtrados.some((item) => item.id === contrato.id)) : base.filter((contrato) => !filtrados.some((item) => item.id === contrato.id));
    }

    return base;
  }, [busqueda, estado, tipo, empresaId, estacionamientoId, moneda, renovacionAutomatica, proximosAVencer]);

  const resumen = getResumenContratos();

  return (
    <AppShell title="Contratos" description="Gestión visual y demostrativa de contratos comerciales y operativos">
      <div className="space-y-6">
        <PageHeader
          title="Contratos"
          description="Vista de referencia para la gestión contractual de ParkFacil, con datos demostrativos y estructura preparada para futuras etapas operativas."
          actions={[
            <button key="nuevo" className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1E5EFF]">
              <Plus className="h-4 w-4" />
              Nuevo contrato
            </button>,
          ]}
        />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <ContratoResumen title="Total de contratos" value={resumen.total} description="Datos de referencia" tone="info" />
          <ContratoResumen title="Borradores" value={resumen.draft} description="Sin firma aún" tone="neutral" />
          <ContratoResumen title="Pendientes de firma" value={resumen.pending_signature} description="Requieren firma" tone="warning" />
          <ContratoResumen title="Vigentes" value={resumen.active} description="Activos hoy" tone="positive" />
          <ContratoResumen title="Próximos a vencer" value={resumen.proximosAVencer} description="En ventana de vigencia" tone="warning" />
          <ContratoResumen title="Finalizados" value={resumen.terminated + resumen.expired + resumen.cancelled} description="Cerrados o cancelados" tone="neutral" />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-[#041E42]">Catálogo de contratos</h3>
              <p className="mt-2 text-sm text-slate-600">Listado visual preparado para la gestión comercial y contractual de ParkFacil.</p>
            </div>
            <StatusBadge variant="warning">Demostrativo</StatusBadge>
          </div>

          <div className="mt-6 space-y-4">
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
              <Search className="h-4 w-4 text-[#3150D8]" />
              <input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar por número, empresa, estacionamiento, responsable o tipo" className="w-full bg-transparent outline-none" />
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
                <span>Empresa</span>
                <select value={empresaId} onChange={(event) => setEmpresaId(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                  {empresas.map((item) => <option key={item} value={item}>{item === "Todos" ? item : item}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-600">
                <span>Estacionamiento</span>
                <select value={estacionamientoId} onChange={(event) => setEstacionamientoId(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                  {estacionamientos.map((item) => <option key={item} value={item}>{item === "Todos" ? item : item}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-600">
                <span>Moneda</span>
                <select value={moneda} onChange={(event) => setMoneda(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                  {monedas.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-600">
                <span>Renovación</span>
                <select value={renovacionAutomatica} onChange={(event) => setRenovacionAutomatica(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                  {renovacion.map((item) => <option key={item} value={item}>{item === "Todos" ? item : item === "si" ? "Automática" : "Manual"}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-600">
                <span>Próximos a vencer</span>
                <select value={proximosAVencer} onChange={(event) => setProximosAVencer(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                  {proximos.map((item) => <option key={item} value={item}>{item === "Todos" ? item : item === "si" ? "Sí" : "No"}</option>)}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-6">
            {resultados.length > 0 ? (
              <ContratosGrid contratos={resultados} />
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
                No hay contratos que coincidan con los filtros aplicados.
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
