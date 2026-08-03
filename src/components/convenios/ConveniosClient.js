"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import ConveniosResumen from "@/components/convenios/ConveniosResumen";
import ConveniosGrid from "@/components/convenios/ConveniosGrid";
import {
  getConveniosDemo,
  searchConvenios,
  calcularResumenGeneral,
  filterConveniosByEstado,
  filterConveniosByTipo,
  filterConveniosByModalidad,
  filterConveniosByEmpresa,
  filterConveniosByEstacionamiento,
  filterConveniosByResponsable,
  filterConveniosByVigencia,
  filterConveniosAplicacionAutomatica,
  filterConveniosRequiereAprobacion,
  filterConveniosConTope,
  filterConveniosPermiteMultiplesUsos,
  filterConveniosConBeneficiarios,
  filterConveniosProximosAVencer,
  getEstadoConvenioLabel,
  getTipoConvenioLabel,
  getModalidadBeneficioLabel,
  estadosConvenioPermitidos,
  tiposConvenioPermitidos,
  modalidadesBeneficioPermitidas,
  getEmpresasRelacionables,
  getUsuariosRelacionables,
} from "@/data/convenios.mjs";
import { getEstacionamientosDemo } from "@/data/estacionamientos.mjs";

const referenceDate = "2026-07-25T10:15:00";
const convenios = getConveniosDemo();
const empresas = getEmpresasRelacionables();
const responsables = getUsuariosRelacionables();
const estacionamientos = getEstacionamientosDemo();

export default function ConveniosClient() {
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("Todos");
  const [tipo, setTipo] = useState("Todos");
  const [modalidad, setModalidad] = useState("Todos");
  const [empresa, setEmpresa] = useState("Todos");
  const [estacionamiento, setEstacionamiento] = useState("Todos");
  const [responsable, setResponsable] = useState("Todos");
  const [vigencia, setVigencia] = useState("Todos");
  const [aplicaAutomatico, setAplicaAutomatico] = useState("Todos");
  const [requiereAprobacion, setRequiereAprobacion] = useState("Todos");
  const [tieneTope, setTieneTope] = useState("Todos");
  const [multiplesUsos, setMultiplesUsos] = useState("Todos");
  const [beneficiariosMinimos, setBeneficiariosMinimos] = useState("Todos");
  const [proximoVencer, setProximoVencer] = useState("Todos");

  const resultados = useMemo(() => {
    let base = searchConvenios(busqueda);

    if (estado !== "Todos") {
      const ids = new Set(filterConveniosByEstado(estado).map((item) => item.id));
      base = base.filter((item) => ids.has(item.id));
    }
    if (tipo !== "Todos") {
      const ids = new Set(filterConveniosByTipo(tipo).map((item) => item.id));
      base = base.filter((item) => ids.has(item.id));
    }
    if (modalidad !== "Todos") {
      const ids = new Set(filterConveniosByModalidad(modalidad).map((item) => item.id));
      base = base.filter((item) => ids.has(item.id));
    }
    if (empresa !== "Todos") {
      const ids = new Set(filterConveniosByEmpresa(empresa).map((item) => item.id));
      base = base.filter((item) => ids.has(item.id));
    }
    if (estacionamiento !== "Todos") {
      const ids = new Set(filterConveniosByEstacionamiento(estacionamiento).map((item) => item.id));
      base = base.filter((item) => ids.has(item.id));
    }
    if (responsable !== "Todos") {
      const ids = new Set(filterConveniosByResponsable(responsable).map((item) => item.id));
      base = base.filter((item) => ids.has(item.id));
    }
    if (vigencia !== "Todos") {
      const ids = new Set(filterConveniosByVigencia(vigencia, referenceDate).map((item) => item.id));
      base = base.filter((item) => ids.has(item.id));
    }
    if (aplicaAutomatico !== "Todos") {
      const ids = new Set(filterConveniosAplicacionAutomatica(aplicaAutomatico === "Si").map((item) => item.id));
      base = base.filter((item) => ids.has(item.id));
    }
    if (requiereAprobacion !== "Todos") {
      const ids = new Set(filterConveniosRequiereAprobacion(requiereAprobacion === "Si").map((item) => item.id));
      base = base.filter((item) => ids.has(item.id));
    }
    if (tieneTope === "Si") {
      const ids = new Set(filterConveniosConTope().map((item) => item.id));
      base = base.filter((item) => ids.has(item.id));
    }
    if (multiplesUsos !== "Todos") {
      const ids = new Set(filterConveniosPermiteMultiplesUsos(multiplesUsos === "Si").map((item) => item.id));
      base = base.filter((item) => ids.has(item.id));
    }
    if (beneficiariosMinimos !== "Todos") {
      const ids = new Set(filterConveniosConBeneficiarios(Number(beneficiariosMinimos)).map((item) => item.id));
      base = base.filter((item) => ids.has(item.id));
    }
    if (proximoVencer === "Si") {
      const ids = new Set(filterConveniosProximosAVencer(referenceDate).map((item) => item.id));
      base = base.filter((item) => ids.has(item.id));
    }

    return base;
  }, [busqueda, estado, tipo, modalidad, empresa, estacionamiento, responsable, vigencia, aplicaAutomatico, requiereAprobacion, tieneTope, multiplesUsos, beneficiariosMinimos, proximoVencer]);

  const resumen = calcularResumenGeneral(referenceDate);

  return (
    <AppShell title="Convenios y Beneficios" description="Administración demostrativa de convenios, descuentos y beneficios aplicables a empresas, usuarios y estacionamientos.">
      <div className="space-y-6">
        <PageHeader
          title="Convenios y Beneficios"
          description="Administración demostrativa de convenios, descuentos y beneficios aplicables a empresas, usuarios y estacionamientos."
          actions={[
            <button key="new" className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1E5EFF]">
              <Plus className="h-4 w-4" />
              Crear convenio
            </button>,
          ]}
        />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <ConveniosResumen title="Total de convenios" value={resumen.total} description="Catalogo demostrativo" tone="info" />
          <ConveniosResumen title="Convenios activos" value={resumen.activos} description="En vigencia" tone="positive" />
          <ConveniosResumen title="Convenios programados" value={resumen.programados} description="Futuros" tone="neutral" />
          <ConveniosResumen title="Convenios suspendidos" value={resumen.suspendidos} description="Con restriccion" tone="warning" />
          <ConveniosResumen title="Convenios vencidos" value={resumen.vencidos} description="No aplicables" tone="warning" />
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <ConveniosResumen title="Empresas beneficiarias" value={resumen.empresasBeneficiarias} description="Empresas relacionadas" tone="info" />
          <ConveniosResumen title="Beneficiarios registrados" value={resumen.beneficiariosRegistrados} description="Registros demo" tone="neutral" />
          <ConveniosResumen title="Beneficios utilizados" value={resumen.beneficiosUtilizados} description="Usos acumulados" tone="neutral" />
          <ConveniosResumen title="Proximos a vencer" value={resumen.proximosAVencer} description="<= 30 dias" tone="warning" />
          <ConveniosResumen title="Consumo acumulado" value={resumen.consumoAcumulado} description="Demostrativo" tone="positive" />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-[#041E42]">Listado de convenios</h3>
              <p className="mt-2 text-sm text-slate-600">Visualizacion demostrativa de convenios comerciales y beneficios. No se aplican descuentos productivos.</p>
            </div>
            <StatusBadge variant="warning">Demostrativo</StatusBadge>
          </div>

          <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="flex flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
              <Search className="h-4 w-4 text-[#3150D8]" />
              <input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar por codigo, nombre, descripcion, empresa, estacionamiento, responsable, patente o beneficiario" className="w-full bg-transparent outline-none" />
            </label>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-2 text-sm text-slate-600"><span>Estado</span><select value={estado} onChange={(event) => setEstado(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none"><option value="Todos">Todos</option>{estadosConvenioPermitidos.map((item) => <option key={item} value={item}>{getEstadoConvenioLabel(item)}</option>)}</select></label>
            <label className="space-y-2 text-sm text-slate-600"><span>Tipo</span><select value={tipo} onChange={(event) => setTipo(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none"><option value="Todos">Todos</option>{tiposConvenioPermitidos.map((item) => <option key={item} value={item}>{getTipoConvenioLabel(item)}</option>)}</select></label>
            <label className="space-y-2 text-sm text-slate-600"><span>Modalidad</span><select value={modalidad} onChange={(event) => setModalidad(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none"><option value="Todos">Todos</option>{modalidadesBeneficioPermitidas.map((item) => <option key={item} value={item}>{getModalidadBeneficioLabel(item)}</option>)}</select></label>
            <label className="space-y-2 text-sm text-slate-600"><span>Empresa</span><select value={empresa} onChange={(event) => setEmpresa(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none"><option value="Todos">Todos</option>{empresas.map((item) => <option key={item.id} value={item.id}>{item.nombreFantasia}</option>)}</select></label>
            <label className="space-y-2 text-sm text-slate-600"><span>Estacionamiento</span><select value={estacionamiento} onChange={(event) => setEstacionamiento(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none"><option value="Todos">Todos</option>{estacionamientos.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
            <label className="space-y-2 text-sm text-slate-600"><span>Responsable</span><select value={responsable} onChange={(event) => setResponsable(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none"><option value="Todos">Todos</option>{responsables.map((item) => <option key={item.id} value={item.id}>{item.nombreCompleto}</option>)}</select></label>
            <label className="space-y-2 text-sm text-slate-600"><span>Vigencia</span><select value={vigencia} onChange={(event) => setVigencia(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none"><option value="Todos">Todos</option><option value="Vigente">Vigente</option><option value="Proximo a vencer">Proximo a vencer</option><option value="Futuro">Futuro</option><option value="Vencido">Vencido</option></select></label>
            <label className="space-y-2 text-sm text-slate-600"><span>Aplicacion automatica</span><select value={aplicaAutomatico} onChange={(event) => setAplicaAutomatico(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none"><option value="Todos">Todos</option><option value="Si">Si</option><option value="No">No</option></select></label>
            <label className="space-y-2 text-sm text-slate-600"><span>Requiere aprobacion</span><select value={requiereAprobacion} onChange={(event) => setRequiereAprobacion(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none"><option value="Todos">Todos</option><option value="Si">Si</option><option value="No">No</option></select></label>
            <label className="space-y-2 text-sm text-slate-600"><span>Tiene tope</span><select value={tieneTope} onChange={(event) => setTieneTope(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none"><option value="Todos">Todos</option><option value="Si">Si</option></select></label>
            <label className="space-y-2 text-sm text-slate-600"><span>Multiples usos</span><select value={multiplesUsos} onChange={(event) => setMultiplesUsos(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none"><option value="Todos">Todos</option><option value="Si">Si</option><option value="No">No</option></select></label>
            <label className="space-y-2 text-sm text-slate-600"><span>Beneficiarios registrados</span><select value={beneficiariosMinimos} onChange={(event) => setBeneficiariosMinimos(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none"><option value="Todos">Todos</option><option value="1">&gt;= 1</option><option value="2">&gt;= 2</option></select></label>
            <label className="space-y-2 text-sm text-slate-600"><span>Proximo a vencer</span><select value={proximoVencer} onChange={(event) => setProximoVencer(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none"><option value="Todos">Todos</option><option value="Si">Si</option></select></label>
          </div>

          <div className="mt-6">
            {resultados.length > 0 ? (
              <ConveniosGrid convenios={resultados} referenceDate={referenceDate} />
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">No hay convenios que coincidan con los filtros aplicados.</div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
