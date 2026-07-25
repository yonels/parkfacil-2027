"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CarFront, KeyRound, Search, ShieldCheck, Users } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import AbonadoResumen from "@/components/abonados/AbonadoResumen";
import AbonadosGrid from "@/components/abonados/AbonadosGrid";
import AbonadosTabla from "@/components/abonados/AbonadosTabla";
import {
  getAbonadosDemo,
  searchAbonados,
  filterAbonadosCredencialesPorVencer,
  getResumenAbonados,
  getTipoAbonadoLabel,
  getEstadoAbonadoLabel,
  getTipoCredencialLabel,
  getTextoVigencia,
} from "@/data/abonados.mjs";
import { getEmpresasDemo } from "@/data/empresas.mjs";
import { getEstacionamientosDemo } from "@/data/estacionamientos.mjs";

const abonados = getAbonadosDemo();
const empresas = getEmpresasDemo();
const estacionamientos = getEstacionamientosDemo();
const estados = ["Todos", "active", "suspended", "pending", "blocked"];
const tiposAbonado = ["Todos", "individual", "company_employee", "resident", "tenant", "supplier", "courtesy", "temporary", "other"];
const tiposCredencial = ["Todos", "license_plate", "rfid_card", "qr_code", "mobile", "barcode", "pin", "biometric_reference", "manual", "other"];
const vigencias = ["Todos", "Vigente", "Próximo a vencer", "Vencido"];
const referenceDate = "2026-08-01";
const sortableKeys = ["abonado", "empresa", "tipo", "inicio", "vencimiento", "estado"];

function compareText(a, b) {
  return String(a || "").localeCompare(String(b || ""), "es", { sensitivity: "base" });
}

function getSortValue(abonado, key) {
  switch (key) {
    case "abonado":
      return abonado.nombre;
    case "empresa":
      return resolveEmpresaName(abonado);
    case "tipo":
      return getTipoAbonadoLabel(abonado.tipo);
    case "inicio":
      return abonado.fechaInicio;
    case "vencimiento":
      return abonado.fechaTermino;
    case "estado":
      return getEstadoAbonadoLabel(abonado.estado);
    default:
      return "";
  }
}

function resolveEmpresaName(abonado) {
  return empresas.find((item) => item.id === abonado.empresaId)?.nombreFantasia || "No registrado";
}

export default function AbonadosClient() {
  const [viewMode, setViewMode] = useState("cards");
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("Todos");
  const [tipo, setTipo] = useState("Todos");
  const [empresa, setEmpresa] = useState("Todos");
  const [estacionamiento, setEstacionamiento] = useState("Todos");
  const [credencial, setCredencial] = useState("Todos");
  const [vigencia, setVigencia] = useState("Todos");
  const [bloqueado, setBloqueado] = useState(false);
  const [credencialesPorVencer, setCredencialesPorVencer] = useState(false);
  const [sortKey, setSortKey] = useState(null);
  const [sortDirection, setSortDirection] = useState(null);

  const hasActiveFilters = Boolean(
    busqueda.trim() ||
    estado !== "Todos" ||
    tipo !== "Todos" ||
    empresa !== "Todos" ||
    estacionamiento !== "Todos" ||
    credencial !== "Todos" ||
    vigencia !== "Todos" ||
    bloqueado ||
    credencialesPorVencer,
  );

  const resetFiltros = () => {
    setBusqueda("");
    setEstado("Todos");
    setTipo("Todos");
    setEmpresa("Todos");
    setEstacionamiento("Todos");
    setCredencial("Todos");
    setVigencia("Todos");
    setBloqueado(false);
    setCredencialesPorVencer(false);
    setViewMode("cards");
    setSortKey(null);
    setSortDirection(null);
  };

  const activateTableView = (callback) => () => {
    callback();
    setViewMode("table");
  };

  const resultados = useMemo(() => {
    const normalizedSearch = busqueda.trim();
    const credencialesPorVencerIds = new Set(filterAbonadosCredencialesPorVencer(referenceDate).map((item) => item.id));
    const base = normalizedSearch ? searchAbonados(normalizedSearch) : abonados;

    return base.filter((abonado) => {
      const matchesEstado = estado === "Todos" || abonado.estado === estado;
      const matchesTipo = tipo === "Todos" || abonado.tipo === tipo;
      const matchesEmpresa = empresa === "Todos" || abonado.empresaId === empresa;
      const matchesEstacionamiento = estacionamiento === "Todos" || abonado.estacionamientos.includes(estacionamiento);
      const matchesCredencial = credencial === "Todos" || abonado.credenciales.some((item) => item.tipo === credencial);
      const matchesVigencia = vigencia === "Todos" || getTextoVigencia(abonado, referenceDate) === vigencia;
      const matchesBloqueado = !bloqueado || abonado.estado === "blocked" || abonado.credenciales.some((item) => item.accesoBloqueado);
      const matchesCredencialesPorVencer = !credencialesPorVencer || credencialesPorVencerIds.has(abonado.id);

      return matchesEstado && matchesTipo && matchesEmpresa && matchesEstacionamiento && matchesCredencial && matchesVigencia && matchesBloqueado && matchesCredencialesPorVencer;
    });
  }, [busqueda, estado, tipo, empresa, estacionamiento, credencial, vigencia, bloqueado, credencialesPorVencer]);

  const resultadosOrdenados = useMemo(() => {
    if (!sortKey || !sortDirection || !sortableKeys.includes(sortKey)) {
      return resultados;
    }

    const sorted = [...resultados].sort((left, right) => {
      const leftValue = getSortValue(left, sortKey);
      const rightValue = getSortValue(right, sortKey);

      if (["inicio", "vencimiento"].includes(sortKey)) {
        return String(leftValue || "").localeCompare(String(rightValue || ""));
      }

      return compareText(leftValue, rightValue);
    });

    return sortDirection === "desc" ? sorted.reverse() : sorted;
  }, [resultados, sortDirection, sortKey]);

  const toggleSort = (key) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDirection("asc");
      return;
    }

    if (sortDirection === "asc") {
      setSortDirection("desc");
      return;
    }

    if (sortDirection === "desc") {
      setSortKey(null);
      setSortDirection(null);
      return;
    }

    setSortDirection("asc");
  };

  const resumen = getResumenAbonados(referenceDate);

  return (
    <AppShell title="Abonados" description="Gestión visual de personas, vehículos y credenciales demostrativas">
      <div className="space-y-6">
        <PageHeader
          title="Abonados"
          description="Administración visual de personas, vehículos, credenciales y permisos de acceso, con datos demostrativos y una experiencia alineada al dashboard de ParkFacil 2027."
          actions={[
            <div key="nuevo" className="flex flex-col items-start gap-2">
              <button type="button" disabled className="inline-flex cursor-not-allowed items-center gap-2 rounded-full bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-500">
                <Users className="h-4 w-4" />
                Nuevo abonado
              </button>
              <span className="text-xs text-slate-500">Formulario disponible en una etapa posterior.</span>
            </div>,
          ]}
        />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AbonadoResumen
            title="Total de abonados"
            value={resumen.total}
            description="Abonados demostrativos"
            tone="info"
            icon={Users}
            onClick={activateTableView(resetFiltros)}
            active={!hasActiveFilters}
          />
          <AbonadoResumen
            title="Abonados activos"
            value={resumen.activos}
            description="Estado activo"
            tone="positive"
            icon={ShieldCheck}
            onClick={activateTableView(() => {
              setEstado("active");
              setTipo("Todos");
              setEmpresa("Todos");
              setEstacionamiento("Todos");
              setCredencial("Todos");
              setVigencia("Todos");
              setBloqueado(false);
              setCredencialesPorVencer(false);
            })}
            active={estado === "active"}
          />
          <AbonadoResumen
            title="Suspendidos"
            value={resumen.suspendidos}
            description="Con suspensión"
            tone="warning"
            icon={AlertTriangle}
            onClick={activateTableView(() => {
              setEstado("suspended");
              setTipo("Todos");
              setEmpresa("Todos");
              setEstacionamiento("Todos");
              setCredencial("Todos");
              setVigencia("Todos");
              setBloqueado(false);
              setCredencialesPorVencer(false);
            })}
            active={estado === "suspended"}
          />
          <AbonadoResumen
            title="Próximos a vencer"
            value={resumen.credencialesPorVencer}
            description="Credenciales cercanas al vencimiento"
            tone="warning"
            icon={KeyRound}
            onClick={activateTableView(() => {
              setEstado("Todos");
              setTipo("Todos");
              setEmpresa("Todos");
              setEstacionamiento("Todos");
              setCredencial("Todos");
              setVigencia("Próximo a vencer");
              setBloqueado(false);
              setCredencialesPorVencer(true);
            })}
            active={vigencia === "Próximo a vencer" || credencialesPorVencer}
          />
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AbonadoResumen
            title="Vehículos autorizados"
            value={resumen.vehiculosAutorizados}
            description="Vehículos válidos"
            tone="positive"
            icon={CarFront}
            onClick={activateTableView(() => {
              setEstado("Todos");
              setTipo("Todos");
              setEmpresa("Todos");
              setEstacionamiento("Todos");
              setCredencial("license_plate");
              setVigencia("Todos");
              setBloqueado(false);
              setCredencialesPorVencer(false);
            })}
            active={credencial === "license_plate"}
          />
          <AbonadoResumen
            title="Credenciales vigentes"
            value={resumen.credencialesVigentes}
            description="Sin vencimiento"
            tone="positive"
            icon={KeyRound}
            onClick={activateTableView(() => {
              setEstado("Todos");
              setTipo("Todos");
              setEmpresa("Todos");
              setEstacionamiento("Todos");
              setCredencial("Todos");
              setVigencia("Vigente");
              setBloqueado(false);
              setCredencialesPorVencer(false);
            })}
            active={vigencia === "Vigente" && !credencialesPorVencer && !bloqueado}
          />
          <AbonadoResumen
            title="Accesos bloqueados"
            value={resumen.accesosBloqueados}
            description="Credenciales con bloqueo"
            tone="neutral"
            icon={AlertTriangle}
            onClick={activateTableView(() => {
              setEstado("Todos");
              setTipo("Todos");
              setEmpresa("Todos");
              setEstacionamiento("Todos");
              setCredencial("Todos");
              setVigencia("Todos");
              setBloqueado(true);
              setCredencialesPorVencer(false);
            })}
            active={bloqueado}
          />
          <AbonadoResumen
            title="Bloqueados"
            value={resumen.bloqueados}
            description="Estado o credencial"
            tone="warning"
            icon={AlertTriangle}
            onClick={activateTableView(() => {
              setEstado("blocked");
              setTipo("Todos");
              setEmpresa("Todos");
              setEstacionamiento("Todos");
              setCredencial("Todos");
              setVigencia("Todos");
              setBloqueado(true);
              setCredencialesPorVencer(false);
            })}
            active={estado === "blocked" || bloqueado}
          />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-[#041E42]">Catálogo de abonados</h3>
              <p className="mt-2 text-sm text-slate-600">Listado visual preparado para la revisión de abonados, credenciales y permisos vigentes dentro del entorno demostrativo.</p>
            </div>
            <StatusBadge variant="warning">Demostrativo</StatusBadge>
          </div>

          <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="flex flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
              <Search className="h-4 w-4 text-[#3150D8]" />
              <input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar por nombre, RUT, patente, correo o credencial" className="w-full bg-transparent outline-none" />
            </label>
            {hasActiveFilters ? (
              <button type="button" onClick={resetFiltros} className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-[#3150D8] transition hover:border-[#3150D8] hover:bg-[#EEF4FF]">
                Limpiar filtros
              </button>
            ) : null}
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

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-500">
              {resultadosOrdenados.length} {resultadosOrdenados.length === 1 ? "abonado encontrado" : "abonados encontrados"}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setViewMode("cards")}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${viewMode === "cards" ? "bg-white text-[#3150D8] shadow-sm" : "text-slate-500 hover:text-[#041E42]"}`}
                >
                  Tarjetas
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${viewMode === "table" ? "bg-white text-[#3150D8] shadow-sm" : "text-slate-500 hover:text-[#041E42]"}`}
                >
                  Tabla
                </button>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={bloqueado} onChange={() => setBloqueado((value) => !value)} />
                Acceso bloqueado
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={credencialesPorVencer} onChange={() => setCredencialesPorVencer((value) => !value)} />
                Credenciales por vencer
              </label>
            </div>
          </div>

          <div className="mt-6">
            {resultadosOrdenados.length > 0 ? (
              viewMode === "table" ? <AbonadosTabla abonados={resultadosOrdenados} sortKey={sortKey} sortDirection={sortDirection} onSort={toggleSort} /> : <AbonadosGrid abonados={resultadosOrdenados} />
            ) : (
              <EmptyState
                title={abonados.length === 0 ? "No hay abonados registrados" : "No hay coincidencias"}
                description={abonados.length === 0 ? "Aún no existen abonados cargados en el catálogo demostrativo." : "Ajusta la búsqueda o limpia los filtros para volver a ver resultados."}
                action={hasActiveFilters ? <button type="button" onClick={resetFiltros} className="inline-flex items-center rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1E5EFF]">Restablecer vista</button> : null}
              />
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}