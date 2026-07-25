"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import AbonadoResumen from "@/components/abonados/AbonadoResumen";
import AbonadosGrid from "@/components/abonados/AbonadosGrid";
import { getAbonadosDemo, searchAbonados, filterAbonadosByEstado, filterAbonadosByTipo, filterAbonadosByEmpresa, filterAbonadosByEstacionamiento, filterAbonadosByTipoCredencial, filterAbonadosByVigencia, filterAbonadosBloqueados, filterAbonadosCredencialesPorVencer, getResumenAbonados, getTipoAbonadoLabel, getEstadoAbonadoLabel, getTipoCredencialLabel } from "@/data/abonados.mjs";
import { getEmpresasDemo } from "@/data/empresas.mjs";
import { getEstacionamientosDemo } from "@/data/estacionamientos.mjs";

const abonados = getAbonadosDemo();
const empresas = getEmpresasDemo();
const estacionamientos = getEstacionamientosDemo();
const estados = ["Todos", "active", "suspended", "pending", "blocked"];
const tiposAbonado = ["Todos", "individual", "company_employee", "resident", "tenant", "supplier", "courtesy", "temporary", "other"];
const tiposCredencial = ["Todos", "license_plate", "rfid_card", "qr_code", "mobile", "barcode", "pin", "biometric_reference", "manual", "other"];
const vigencias = ["Todos", "Vigente", "Próximo a vencer", "Vencido"];

export default function AbonadosClient() {
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("Todos");
  const [tipo, setTipo] = useState("Todos");
  const [empresa, setEmpresa] = useState("Todos");
  const [estacionamiento, setEstacionamiento] = useState("Todos");
  const [credencial, setCredencial] = useState("Todos");
  const [vigencia, setVigencia] = useState("Todos");
  const [bloqueado, setBloqueado] = useState(false);
  const [credencialesPorVencer, setCredencialesPorVencer] = useState(false);

  const resultados = useMemo(() => {
    let base = searchAbonados(busqueda);

    if (estado !== "Todos") {
      base = filterAbonadosByEstado(estado);
    }
    if (tipo !== "Todos") {
      base = base.filter((abonado) => abonado.tipo === tipo);
    }
    if (empresa !== "Todos") {
      base = base.filter((abonado) => abonado.empresaId === empresa);
    }
    if (estacionamiento !== "Todos") {
      base = base.filter((abonado) => abonado.estacionamientos.includes(estacionamiento));
    }
    if (credencial !== "Todos") {
      base = base.filter((abonado) => abonado.credenciales.some((item) => item.tipo === credencial));
    }
    if (vigencia !== "Todos") {
      base = base.filter((abonado) => (vigencia === "Vigente" ? true : vigencia === "Próximo a vencer" ? true : false));
    }
    if (bloqueado) {
      base = filterAbonadosBloqueados();
    }
    if (credencialesPorVencer) {
      base = filterAbonadosCredencialesPorVencer("2026-08-01");
    }

    return base;
  }, [busqueda, estado, tipo, empresa, estacionamiento, credencial, vigencia, bloqueado, credencialesPorVencer]);

  const resumen = getResumenAbonados("2026-08-01");

  return (
    <AppShell title="Abonados y Credenciales" description="Administración visual de personas, vehículos y permisos de acceso demostrativos">
      <div className="space-y-6">
        <PageHeader
          title="Abonados y Credenciales"
          description="Administración visual de personas, vehículos, credenciales y permisos de acceso, con datos demostrativos y alcance de referencia para futuras etapas operativas."
          actions={[
            <button key="nuevo" className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1E5EFF]">
              <Plus className="h-4 w-4" />
              Nuevo abonado
            </button>,
          ]}
        />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AbonadoResumen title="Total de abonados" value={resumen.total} description="Abonados demostrativos" tone="info" />
          <AbonadoResumen title="Abonados activos" value={resumen.activos} description="Estado activo" tone="positive" />
          <AbonadoResumen title="Abonados suspendidos" value={resumen.suspendidos} description="Con suspensión" tone="warning" />
          <AbonadoResumen title="Vehículos autorizados" value={resumen.vehiculosAutorizados} description="Vehículos válidos" tone="neutral" />
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AbonadoResumen title="Credenciales vigentes" value={resumen.credencialesVigentes} description="Sin vencimiento" tone="positive" />
          <AbonadoResumen title="Credenciales por vencer" value={resumen.credencialesPorVencer} description="Próximas a caducar" tone="warning" />
          <AbonadoResumen title="Accesos bloqueados" value={resumen.accesosBloqueados} description="Con bloqueo" tone="neutral" />
          <AbonadoResumen title="Bloqueados" value={resumen.bloqueados} description="Estado o credencial" tone="warning" />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-[#041E42]">Catálogo de abonados</h3>
              <p className="mt-2 text-sm text-slate-600">Listado visual preparado para administración de accesos autorizados, con datos demostrativos y sin operaciones reales.</p>
            </div>
            <StatusBadge variant="warning">Demostrativo</StatusBadge>
          </div>

          <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="flex flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
              <Search className="h-4 w-4 text-[#3150D8]" />
              <input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar por nombre, RUT, patente, correo o credencial" className="w-full bg-transparent outline-none" />
            </label>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-2 text-sm text-slate-600">
              <span>Estado</span>
              <select value={estado} onChange={(event) => setEstado(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                {estados.map((item) => <option key={item} value={item}>{item === "Todos" ? item : getEstadoAbonadoLabel(item)}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-600">
              <span>Tipo de abonado</span>
              <select value={tipo} onChange={(event) => setTipo(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                {tiposAbonado.map((item) => <option key={item} value={item}>{item === "Todos" ? item : getTipoAbonadoLabel(item)}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-600">
              <span>Empresa</span>
              <select value={empresa} onChange={(event) => setEmpresa(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                <option value="Todos">Todos</option>
                {empresas.map((item) => <option key={item.id} value={item.id}>{item.nombreFantasia}</option>)}
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
              <span>Tipo de credencial</span>
              <select value={credencial} onChange={(event) => setCredencial(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                {tiposCredencial.map((item) => <option key={item} value={item}>{item === "Todos" ? item : getTipoCredencialLabel(item)}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-600">
              <span>Vigencia</span>
              <select value={vigencia} onChange={(event) => setVigencia(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                {vigencias.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={bloqueado} onChange={() => setBloqueado((value) => !value)} />
              Acceso bloqueado
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={credencialesPorVencer} onChange={() => setCredencialesPorVencer((value) => !value)} />
              Credenciales por vencer
            </label>
          </div>

          <div className="mt-6">
            {resultados.length > 0 ? (
              <AbonadosGrid abonados={resultados} />
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
                No hay abonados que coincidan con los filtros aplicados.
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
