"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import VisitaResumen from "@/components/visitas/VisitaResumen";
import VisitasGrid from "@/components/visitas/VisitasGrid";
import {
  getVisitasDemo,
  searchVisitas,
  calcularResumenVisitas,
  filterVisitasByEstado,
  filterVisitasByTipo,
  filterVisitasByAprobacion,
  filterVisitasByEstacionamiento,
  filterVisitasByAcceso,
  filterVisitasByEmpresaAnfitriona,
  filterVisitasByAnfitrion,
  filterVisitasByMedioIdentificacion,
  filterVisitasConVehiculo,
  filterVisitasByFecha,
  filterVisitasByVigencia,
  getTipoVisitaLabel,
  getEstadoVisitaLabel,
  getEstadoAprobacionLabel,
  getMedioIdentificacionLabel,
  tiposVisitaPermitidos,
  estadosVisitaPermitidos,
  estadosAprobacionPermitidos,
  mediosIdentificacionPermitidos,
} from "@/data/visitas.mjs";
import { getEmpresasDemo } from "@/data/empresas.mjs";
import { getUsuariosDemo } from "@/data/usuarios.mjs";
import { getEstacionamientosDemo } from "@/data/estacionamientos.mjs";
import { getControlAccesosDemo } from "@/data/controlAccesos.mjs";

const referenceDate = "2026-07-25T10:15:00";
const visitas = getVisitasDemo();
const empresas = getEmpresasDemo();
const anfitriones = getUsuariosDemo();
const estacionamientos = getEstacionamientosDemo();
const accesos = getControlAccesosDemo();

export default function VisitasClient() {
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("Todos");
  const [tipoVisita, setTipoVisita] = useState("Todos");
  const [aprobacion, setAprobacion] = useState("Todos");
  const [estacionamiento, setEstacionamiento] = useState("Todos");
  const [acceso, setAcceso] = useState("Todos");
  const [empresaAnfitriona, setEmpresaAnfitriona] = useState("Todos");
  const [anfitrion, setAnfitrion] = useState("Todos");
  const [medio, setMedio] = useState("Todos");
  const [conVehiculo, setConVehiculo] = useState("Todos");
  const [fechaDemo, setFechaDemo] = useState("Todos");
  const [vigencia, setVigencia] = useState("Todos");

  const resultados = useMemo(() => {
    let base = searchVisitas(busqueda);

    if (estado !== "Todos") {
      const ids = new Set(filterVisitasByEstado(estado).map((item) => item.id));
      base = base.filter((item) => ids.has(item.id));
    }
    if (tipoVisita !== "Todos") {
      const ids = new Set(filterVisitasByTipo(tipoVisita).map((item) => item.id));
      base = base.filter((item) => ids.has(item.id));
    }
    if (aprobacion !== "Todos") {
      const ids = new Set(filterVisitasByAprobacion(aprobacion).map((item) => item.id));
      base = base.filter((item) => ids.has(item.id));
    }
    if (estacionamiento !== "Todos") {
      const ids = new Set(filterVisitasByEstacionamiento(estacionamiento).map((item) => item.id));
      base = base.filter((item) => ids.has(item.id));
    }
    if (acceso !== "Todos") {
      const ids = new Set(filterVisitasByAcceso(acceso).map((item) => item.id));
      base = base.filter((item) => ids.has(item.id));
    }
    if (empresaAnfitriona !== "Todos") {
      const ids = new Set(filterVisitasByEmpresaAnfitriona(empresaAnfitriona).map((item) => item.id));
      base = base.filter((item) => ids.has(item.id));
    }
    if (anfitrion !== "Todos") {
      const ids = new Set(filterVisitasByAnfitrion(anfitrion).map((item) => item.id));
      base = base.filter((item) => ids.has(item.id));
    }
    if (medio !== "Todos") {
      const ids = new Set(filterVisitasByMedioIdentificacion(medio).map((item) => item.id));
      base = base.filter((item) => ids.has(item.id));
    }
    if (conVehiculo !== "Todos") {
      const ids = new Set(filterVisitasConVehiculo(conVehiculo === "Si").map((item) => item.id));
      base = base.filter((item) => ids.has(item.id));
    }
    if (fechaDemo !== "Todos") {
      const ids = new Set(filterVisitasByFecha(fechaDemo).map((item) => item.id));
      base = base.filter((item) => ids.has(item.id));
    }
    if (vigencia !== "Todos") {
      const ids = new Set(filterVisitasByVigencia(vigencia, referenceDate).map((item) => item.id));
      base = base.filter((item) => ids.has(item.id));
    }

    return base;
  }, [busqueda, estado, tipoVisita, aprobacion, estacionamiento, acceso, empresaAnfitriona, anfitrion, medio, conVehiculo, fechaDemo, vigencia]);

  const resumen = calcularResumenVisitas(referenceDate);
  const fechasDisponibles = Array.from(new Set(visitas.map((item) => item.visitDate))).sort();

  return (
    <AppShell title="Visitas y Reservas" description="Administracion demostrativa de visitas, invitados y autorizaciones temporales de acceso.">
      <div className="space-y-6">
        <PageHeader
          title="Visitas y Reservas"
          description="Administracion demostrativa de visitas, invitados y autorizaciones temporales de acceso."
          actions={[
            <button key="new" className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1E5EFF]">
              <Plus className="h-4 w-4" />
              Crear visita
            </button>,
          ]}
        />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <VisitaResumen title="Visitas programadas" value={resumen.programadas} description="Futuras" tone="info" />
          <VisitaResumen title="Visitas en curso" value={resumen.enCurso} description="Vigentes ahora" tone="positive" />
          <VisitaResumen title="Visitas del dia" value={resumen.visitasDelDia} description="Fecha de referencia" tone="neutral" />
          <VisitaResumen title="Visitas finalizadas" value={resumen.finalizadas} description="Con cierre" tone="neutral" />
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <VisitaResumen title="Visitas canceladas" value={resumen.canceladas} description="Sin ingreso" tone="warning" />
          <VisitaResumen title="Reservas por vencer" value={resumen.reservasPorVencer} description="<= 60 minutos" tone="warning" />
          <VisitaResumen title="Accesos pendientes de aprobacion" value={resumen.accesosPendientesAprobacion} description="Revision requerida" tone="warning" />
          <VisitaResumen title="Visitas con vehiculo" value={resumen.conVehiculo} description="Vehiculares" tone="info" />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-[#041E42]">Listado demostrativo de visitas</h3>
              <p className="mt-2 text-sm text-slate-600">Datos exclusivamente demostrativos. No hay aprobaciones reales, envios de invitacion ni control fisico operativo.</p>
            </div>
            <StatusBadge variant="warning">Demostrativo</StatusBadge>
          </div>

          <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="flex flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
              <Search className="h-4 w-4 text-[#3150D8]" />
              <input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar por codigo, visitante, identificador, patente, empresa, anfitrion, estacionamiento o acceso" className="w-full bg-transparent outline-none" />
            </label>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-2 text-sm text-slate-600"><span>Estado</span><select value={estado} onChange={(event) => setEstado(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none"><option value="Todos">Todos</option>{estadosVisitaPermitidos.map((item) => <option key={item} value={item}>{getEstadoVisitaLabel(item)}</option>)}</select></label>
            <label className="space-y-2 text-sm text-slate-600"><span>Tipo de visita</span><select value={tipoVisita} onChange={(event) => setTipoVisita(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none"><option value="Todos">Todos</option>{tiposVisitaPermitidos.map((item) => <option key={item} value={item}>{getTipoVisitaLabel(item)}</option>)}</select></label>
            <label className="space-y-2 text-sm text-slate-600"><span>Estado de aprobacion</span><select value={aprobacion} onChange={(event) => setAprobacion(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none"><option value="Todos">Todos</option>{estadosAprobacionPermitidos.map((item) => <option key={item} value={item}>{getEstadoAprobacionLabel(item)}</option>)}</select></label>
            <label className="space-y-2 text-sm text-slate-600"><span>Estacionamiento</span><select value={estacionamiento} onChange={(event) => setEstacionamiento(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none"><option value="Todos">Todos</option>{estacionamientos.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
            <label className="space-y-2 text-sm text-slate-600"><span>Acceso</span><select value={acceso} onChange={(event) => setAcceso(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none"><option value="Todos">Todos</option>{accesos.map((item) => <option key={item.id} value={item.id}>{item.codigo} · {item.nombre}</option>)}</select></label>
            <label className="space-y-2 text-sm text-slate-600"><span>Empresa anfitriona</span><select value={empresaAnfitriona} onChange={(event) => setEmpresaAnfitriona(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none"><option value="Todos">Todos</option>{empresas.map((item) => <option key={item.id} value={item.id}>{item.nombreFantasia}</option>)}</select></label>
            <label className="space-y-2 text-sm text-slate-600"><span>Anfitrion</span><select value={anfitrion} onChange={(event) => setAnfitrion(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none"><option value="Todos">Todos</option>{anfitriones.map((item) => <option key={item.id} value={item.id}>{item.nombreCompleto}</option>)}</select></label>
            <label className="space-y-2 text-sm text-slate-600"><span>Medio de identificacion</span><select value={medio} onChange={(event) => setMedio(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none"><option value="Todos">Todos</option>{mediosIdentificacionPermitidos.map((item) => <option key={item} value={item}>{getMedioIdentificacionLabel(item)}</option>)}</select></label>
            <label className="space-y-2 text-sm text-slate-600"><span>Visita con vehiculo</span><select value={conVehiculo} onChange={(event) => setConVehiculo(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none"><option value="Todos">Todos</option><option value="Si">Si</option><option value="No">No</option></select></label>
            <label className="space-y-2 text-sm text-slate-600"><span>Fecha demostrativa</span><select value={fechaDemo} onChange={(event) => setFechaDemo(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none"><option value="Todos">Todos</option>{fechasDisponibles.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label className="space-y-2 text-sm text-slate-600"><span>Vigencia</span><select value={vigencia} onChange={(event) => setVigencia(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none"><option value="Todos">Todos</option><option value="Vigente">Vigente</option><option value="Proxima a vencer">Proxima a vencer</option><option value="Futura">Futura</option><option value="Finalizada">Finalizada</option><option value="Vencida">Vencida</option><option value="No vigente">No vigente</option></select></label>
          </div>

          <div className="mt-6">
            {resultados.length > 0 ? (
              <VisitasGrid visitas={resultados} referenceDate={referenceDate} />
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">No hay visitas que coincidan con los filtros aplicados.</div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
