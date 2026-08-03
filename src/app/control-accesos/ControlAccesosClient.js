"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import ControlAccesoResumen from "@/components/control-accesos/ControlAccesoResumen";
import ControlAccesosGrid from "@/components/control-accesos/ControlAccesosGrid";
import {
  getControlAccesosDemo,
  searchControlAccesos,
  getResumenControlAccesos,
  getIndicadoresControlAccesos,
  getEstadisticasControlAccesos,
  getTipoAccesoLabel,
  getEstadoControlAccesoLabel,
  getModoOperacionLabel,
  tiposAccesoPermitidos,
  estadosControlAccesoPermitidos,
  modosOperacionPermitidos,
} from "@/data/controlAccesos.mjs";
import { getEstacionamientosDemo } from "@/data/estacionamientos.mjs";
import { getDispositivosDemo } from "@/data/dispositivos.mjs";
import { getUsuariosDemo } from "@/data/usuarios.mjs";

const accesos = getControlAccesosDemo();
const estacionamientos = getEstacionamientosDemo();
const dispositivos = getDispositivosDemo();
const usuarios = getUsuariosDemo();
const estadosOperacionales = ["Todos", "Operativo", "En revision", "Suspendido", "Bloqueado", "Contingencia"];

export default function ControlAccesosClient() {
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("Todos");
  const [tipoAcceso, setTipoAcceso] = useState("Todos");
  const [modoOperacion, setModoOperacion] = useState("Todos");
  const [estacionamiento, setEstacionamiento] = useState("Todos");
  const [dispositivo, setDispositivo] = useState("Todos");
  const [operador, setOperador] = useState("Todos");
  const [estadoOperacional, setEstadoOperacional] = useState("Todos");

  const resultados = useMemo(() => {
    let base = searchControlAccesos(busqueda);

    if (estado !== "Todos") {
      base = base.filter((acceso) => acceso.estado === estado);
    }
    if (tipoAcceso !== "Todos") {
      base = base.filter((acceso) => acceso.tipoAcceso === tipoAcceso);
    }
    if (modoOperacion !== "Todos") {
      base = base.filter((acceso) => acceso.modoOperacion === modoOperacion);
    }
    if (estacionamiento !== "Todos") {
      base = base.filter((acceso) => acceso.estacionamientoId === estacionamiento);
    }
    if (dispositivo !== "Todos") {
      base = base.filter((acceso) => acceso.dispositivoId === dispositivo);
    }
    if (operador !== "Todos") {
      base = base.filter((acceso) => acceso.operadorId === operador);
    }
    if (estadoOperacional !== "Todos") {
      base = base.filter((acceso) => acceso.estadoOperacional === estadoOperacional);
    }

    return base;
  }, [busqueda, estado, tipoAcceso, modoOperacion, estacionamiento, dispositivo, operador, estadoOperacional]);

  const resumen = getResumenControlAccesos();
  const indicadores = getIndicadoresControlAccesos();
  const estadisticas = getEstadisticasControlAccesos();

  return (
    <AppShell title="Control de Accesos" description="Administracion visual de accesos fisicos y logicos en modo demostrativo">
      <div className="space-y-6">
        <PageHeader
          title="Control de Accesos"
          description="Base visual para administrar puntos de entrada y salida, operadores, dispositivos y estado operacional sin conectividad real con barreras, hardware ni servicios externos."
          actions={[
            <button key="nuevo" className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1E5EFF]">
              <Plus className="h-4 w-4" />
              Crear acceso
            </button>,
          ]}
        />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ControlAccesoResumen title="Total de accesos" value={resumen.total} description="Catalogo demostrativo" tone="info" />
          <ControlAccesoResumen title="Activos" value={resumen.active} description="Operables" tone="positive" />
          <ControlAccesoResumen title="En mantenimiento" value={resumen.maintenance} description="Bajo revision" tone="warning" />
          <ControlAccesoResumen title="Bloqueados" value={resumen.blocked} description="Con restriccion" tone="neutral" />
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ControlAccesoResumen title="Modo automatico" value={resumen.automatic} description="Operacion automatica" tone="positive" />
          <ControlAccesoResumen title="Modo manual" value={resumen.manual} description="Supervision humana" tone="warning" />
          <ControlAccesoResumen title="Con incidencias" value={indicadores.conIncidencias} description="Requieren seguimiento" tone="neutral" />
          <ControlAccesoResumen title="Referencias incompletas" value={indicadores.conReferenciasIncompletas} description="Relaciones faltantes" tone="warning" />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-[#041E42]">Listado de accesos</h3>
              <p className="mt-2 text-sm text-slate-600">Busqueda y filtros del modulo de gestion de accesos con datos 100% demostrativos.</p>
            </div>
            <StatusBadge variant="warning">Demostrativo</StatusBadge>
          </div>

          <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="flex flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
              <Search className="h-4 w-4 text-[#3150D8]" />
              <input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar por nombre, codigo, estacionamiento, dispositivo u operador" className="w-full bg-transparent outline-none" />
            </label>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-2 text-sm text-slate-600">
              <span>Estado</span>
              <select value={estado} onChange={(event) => setEstado(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                <option value="Todos">Todos</option>
                {estadosControlAccesoPermitidos.map((item) => <option key={item} value={item}>{getEstadoControlAccesoLabel(item)}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-600">
              <span>Tipo de acceso</span>
              <select value={tipoAcceso} onChange={(event) => setTipoAcceso(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                <option value="Todos">Todos</option>
                {tiposAccesoPermitidos.map((item) => <option key={item} value={item}>{getTipoAccesoLabel(item)}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-600">
              <span>Modo de operacion</span>
              <select value={modoOperacion} onChange={(event) => setModoOperacion(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                <option value="Todos">Todos</option>
                {modosOperacionPermitidos.map((item) => <option key={item} value={item}>{getModoOperacionLabel(item)}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-600">
              <span>Estado operacional</span>
              <select value={estadoOperacional} onChange={(event) => setEstadoOperacional(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                {estadosOperacionales.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-600">
              <span>Estacionamiento</span>
              <select value={estacionamiento} onChange={(event) => setEstacionamiento(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                <option value="Todos">Todos</option>
                {estacionamientos.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-600">
              <span>Dispositivo</span>
              <select value={dispositivo} onChange={(event) => setDispositivo(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                <option value="Todos">Todos</option>
                {dispositivos.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-600">
              <span>Operador</span>
              <select value={operador} onChange={(event) => setOperador(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                <option value="Todos">Todos</option>
                {usuarios.map((item) => <option key={item.id} value={item.id}>{item.nombreCompleto}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-6">
            {resultados.length > 0 ? (
              <ControlAccesosGrid accesos={resultados} />
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
                No hay accesos que coincidan con los filtros aplicados.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl font-semibold text-[#041E42]">Indicadores y estado operacional</h3>
            <StatusBadge variant="info">Vista de referencia</StatusBadge>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-semibold text-[#041E42]">Cobertura 24/7</p>
              <p className="mt-2 text-2xl font-semibold">{indicadores.cobertura24x7}</p>
              <p className="mt-1">Accesos con operacion continua demostrativa.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-semibold text-[#041E42]">Capacidad vehicular total</p>
              <p className="mt-2 text-2xl font-semibold">{estadisticas.capacidadVehicularTotal}</p>
              <p className="mt-1">Vehiculos por hora en referencia.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-semibold text-[#041E42]">Capacidad peatonal total</p>
              <p className="mt-2 text-2xl font-semibold">{estadisticas.capacidadPeatonalTotal}</p>
              <p className="mt-1">Personas por hora en referencia.</p>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
