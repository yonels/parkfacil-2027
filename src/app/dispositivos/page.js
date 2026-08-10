"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Pencil, Save, Search, X } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import DispositivoResumen from "@/components/dispositivos/DispositivoResumen";
import SpreadsheetTable from "@/components/ui/SpreadsheetTable";
import { getDispositivosDemo } from "@/data/dispositivos.mjs";
import { getEstacionamientoById, getEstacionamientosDemo } from "@/data/estacionamientos.mjs";

const estacionamientos = getEstacionamientosDemo();
const tipos = ["Todos", "Cámara LPR", "Barrera", "Terminal POS", "Impresora", "Lector QR", "Sensor", "Controlador de acceso", "Cajero automático", "Computador", "Dispositivo Android"];
const estados = ["Todos", "active", "inactive", "maintenance", "retired"];
const conexiones = ["Todos", "online", "offline", "warning", "unknown"];
const STORAGE_KEY = "parkfacil-dispositivos-edicion";

function cloneDemoDispositivos() {
  return getDispositivosDemo().map((dispositivo) => ({
    ...dispositivo,
    alertas: Array.isArray(dispositivo.alertas) ? [...dispositivo.alertas] : [],
    historial: Array.isArray(dispositivo.historial) ? [...dispositivo.historial] : [],
    configuracion: Array.isArray(dispositivo.configuracion) ? [...dispositivo.configuracion] : [],
  }));
}

function labelEstado(estado) {
  const labels = {
    active: "Activo",
    inactive: "Inactivo",
    maintenance: "Mantenimiento",
    retired: "Retirado",
  };

  return labels[estado] ?? estado;
}

function DevicesInventory({ initialType }) {
  const [dispositivos, setDispositivos] = useState(() => {
    if (typeof window === "undefined") return cloneDemoDispositivos();
    try {
      const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
      return Array.isArray(parsed) ? parsed : cloneDemoDispositivos();
    } catch {
      return cloneDemoDispositivos();
    }
  });
  const [busqueda, setBusqueda] = useState("");
  const [tipo, setTipo] = useState(initialType);
  const [estado, setEstado] = useState("Todos");
  const [conexion, setConexion] = useState("Todos");
  const [estacionamiento, setEstacionamiento] = useState("Todos");
  const [editingDeviceId, setEditingDeviceId] = useState(null);
  const [editForm, setEditForm] = useState({
    nombre: "",
    tipo: "",
    estado: "active",
    conexion: "online",
    estacionamientoId: "sin-asignar",
    ubicacion: "",
  });
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(dispositivos));
    } catch {
      // Si el almacenamiento falla, conservamos el flujo en memoria.
    }
  }, [dispositivos]);

  useEffect(() => {
    if (!saveMessage) return;
    const timer = window.setTimeout(() => setSaveMessage(""), 2600);
    return () => window.clearTimeout(timer);
  }, [saveMessage]);

  const dispositivoEditando = useMemo(() => {
    if (!editingDeviceId) return null;
    return dispositivos.find((item) => item.id === editingDeviceId) ?? null;
  }, [dispositivos, editingDeviceId]);

  function openEditor(dispositivo) {
    setEditingDeviceId(dispositivo.id);
    setEditForm({
      nombre: dispositivo.nombre,
      tipo: dispositivo.tipo,
      estado: dispositivo.estado,
      conexion: dispositivo.conexion,
      estacionamientoId: dispositivo.estacionamientoId || "sin-asignar",
      ubicacion: dispositivo.ubicacion,
    });
  }

  function closeEditor() {
    setEditingDeviceId(null);
  }

  function saveEdition(event) {
    event.preventDefault();
    if (!editingDeviceId) return;
    setDispositivos((current) => current.map((item) => {
      if (item.id !== editingDeviceId) return item;
      return {
        ...item,
        nombre: editForm.nombre.trim() || item.nombre,
        tipo: editForm.tipo,
        estado: editForm.estado,
        conexion: editForm.conexion,
        estacionamientoId: editForm.estacionamientoId,
        ubicacion: editForm.ubicacion.trim() || item.ubicacion,
      };
    }));
    setSaveMessage("Dispositivo actualizado y asignación guardada.");
    closeEditor();
  }

  const resultados = useMemo(() => {
    const normalized = busqueda.trim().toLowerCase();
    const base = !normalized
      ? dispositivos
      : dispositivos.filter((dispositivo) => {
          const parkingName = getEstacionamientoById(dispositivo.estacionamientoId)?.nombre || "";
          return [
            dispositivo.nombre,
            dispositivo.codigo,
            dispositivo.marca,
            dispositivo.modelo,
            parkingName,
            dispositivo.ubicacion,
          ].some((value) => String(value || "").toLowerCase().includes(normalized));
        });

    return base.filter((dispositivo) => {
      const matchesTipo = tipo === "Todos" || dispositivo.tipo === tipo;
      const matchesEstado = estado === "Todos" || dispositivo.estado === estado;
      const matchesConexion = conexion === "Todos" || dispositivo.conexion === conexion;
      const matchesEstacionamiento = estacionamiento === "Todos" || dispositivo.estacionamientoId === estacionamiento;
      return matchesTipo && matchesEstado && matchesConexion && matchesEstacionamiento;
    });
  }, [dispositivos, busqueda, tipo, estado, conexion, estacionamiento]);

  const resumen = {
    total: dispositivos.length,
    conectados: dispositivos.filter((item) => item.conexion === "online").length,
    desconectados: dispositivos.filter((item) => item.conexion === "offline").length,
    mantenimiento: dispositivos.filter((item) => item.estado === "maintenance").length,
    alertas: dispositivos.filter((item) => item.alertas.some((alerta) => alerta !== "Sin alertas")).length,
  };
  const columns = [
    { key: "codigo", label: "Código" },
    { key: "nombre", label: "Dispositivo" },
    { key: "tipo", label: "Tipo" },
    { key: "marcaModelo", label: "Marca / Modelo" },
    { key: "estacionamiento", label: "Estacionamiento" },
    { key: "ubicacion", label: "Ubicación" },
    { key: "estado", label: "Estado" },
    { key: "conexion", label: "Conexión" },
    { key: "ultimaComunicacion", label: "Última comunicación" },
    {
      key: "acciones",
      label: "Acciones",
      sortable: false,
      className: "w-32",
      render: (row) => (
        <button
          type="button"
          onClick={() => openEditor(row.original)}
          className="inline-flex items-center gap-1 rounded-lg border border-[#3150D8]/30 bg-[#EEF4FF] px-2.5 py-1.5 text-xs font-semibold text-[#3150D8] transition hover:bg-[#DCE8FF]"
        >
          <Pencil className="h-3.5 w-3.5" />
          Modificar dispositivo
        </button>
      ),
    },
  ];
  const rows = resultados.map((dispositivo) => ({
    id: dispositivo.id,
    original: dispositivo,
    codigo: dispositivo.codigo,
    nombre: dispositivo.nombre,
    tipo: dispositivo.tipo,
    marcaModelo: `${dispositivo.marca} / ${dispositivo.modelo}`,
    estacionamiento: getEstacionamientoById(dispositivo.estacionamientoId)?.nombre ?? "Sin asignar",
    ubicacion: dispositivo.ubicacion,
    estado: labelEstado(dispositivo.estado),
    conexion: dispositivo.conexion,
    ultimaComunicacion: dispositivo.ultimaComunicacion,
  }));

  return (
    <AppShell title="Dispositivos" description="Inventario tecnológico de referencia para ParkFacil">
      <div className="space-y-6">
        <PageHeader
          title="Dispositivos"
          description="Inventario tecnológico de referencia de ParkFacil, orientado a la estructuración visual del módulo y su relación con los estacionamientos."
          actions={[
            <Link key="volver" href="/" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#041E42] transition hover:border-[#3150D8] hover:text-[#3150D8]">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Link>,
          ]}
        />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <DispositivoResumen title="Total de dispositivos" value={resumen.total} description="Datos de referencia" tone="info" />
          <DispositivoResumen title="Conectados" value={resumen.conectados} description="En línea" tone="positive" />
          <DispositivoResumen title="Desconectados" value={resumen.desconectados} description="Sin comunicación" tone="warning" />
          <DispositivoResumen title="En mantenimiento" value={resumen.mantenimiento} description="Revisión pendiente" tone="neutral" />
          <DispositivoResumen title="Con alertas" value={resumen.alertas} description="Requieren seguimiento" tone="warning" />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-[#041E42]">Inventario tecnológico</h3>
              <p className="mt-2 text-sm text-slate-600">Vista estructural preparada para futuras operaciones reales.</p>
            </div>
            <StatusBadge variant="warning">Demostrativo</StatusBadge>
          </div>

          <div className="mt-6 space-y-4">
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
              <Search className="h-4 w-4 text-[#3150D8]" />
              <input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar por nombre, código, marca, modelo o estacionamiento" className="w-full bg-transparent outline-none" />
            </label>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2 text-sm text-slate-600">
                <span>Tipo</span>
                <select value={tipo} onChange={(event) => setTipo(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                  {tipos.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-600">
                <span>Estado</span>
                <select value={estado} onChange={(event) => setEstado(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                  {estados.map((item) => <option key={item} value={item}>{item === "Todos" ? item : labelEstado(item)}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-600">
                <span>Conexión</span>
                <select value={conexion} onChange={(event) => setConexion(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                  {conexiones.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-600">
                <span>Estacionamiento</span>
                <select value={estacionamiento} onChange={(event) => setEstacionamiento(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none">
                  <option value="Todos">Todos</option>
                  {estacionamientos.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-6">
            <SpreadsheetTable columns={columns} rows={rows} emptyMessage="No hay dispositivos que coincidan con los filtros actuales." />
          </div>

          {saveMessage ? <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{saveMessage}</p> : null}
        </section>
      </div>

      {dispositivoEditando ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#041E42]/45 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor(); }}>
          <section className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#3150D8]">Modificar dispositivo</p>
                <h3 className="mt-1 text-lg font-semibold text-[#041E42]">{dispositivoEditando.codigo} · {dispositivoEditando.nombre}</h3>
              </div>
              <button type="button" onClick={closeEditor} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Cerrar editor">
                <X className="h-5 w-5" />
              </button>
            </header>

            <form onSubmit={saveEdition} className="space-y-4 p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-700">
                  <span className="font-medium">Nombre del dispositivo</span>
                  <input
                    value={editForm.nombre}
                    onChange={(event) => setEditForm((current) => ({ ...current, nombre: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-[#3150D8]"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-700">
                  <span className="font-medium">Tipo</span>
                  <select
                    value={editForm.tipo}
                    onChange={(event) => setEditForm((current) => ({ ...current, tipo: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-[#3150D8]"
                  >
                    {tipos.filter((item) => item !== "Todos").map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label className="space-y-2 text-sm text-slate-700">
                  <span className="font-medium">Estado</span>
                  <select
                    value={editForm.estado}
                    onChange={(event) => setEditForm((current) => ({ ...current, estado: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-[#3150D8]"
                  >
                    {estados.filter((item) => item !== "Todos").map((item) => <option key={item} value={item}>{labelEstado(item)}</option>)}
                  </select>
                </label>
                <label className="space-y-2 text-sm text-slate-700">
                  <span className="font-medium">Conexión</span>
                  <select
                    value={editForm.conexion}
                    onChange={(event) => setEditForm((current) => ({ ...current, conexion: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-[#3150D8]"
                  >
                    {conexiones.filter((item) => item !== "Todos").map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-700">
                  <span className="font-medium">Estacionamiento asignado</span>
                  <select
                    value={editForm.estacionamientoId}
                    onChange={(event) => setEditForm((current) => ({ ...current, estacionamientoId: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-[#3150D8]"
                  >
                    <option value="sin-asignar">Sin asignar</option>
                    {estacionamientos.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
                  </select>
                </label>
                <label className="space-y-2 text-sm text-slate-700">
                  <span className="font-medium">Ubicación interna</span>
                  <input
                    value={editForm.ubicacion}
                    onChange={(event) => setEditForm((current) => ({ ...current, ubicacion: event.target.value }))}
                    placeholder="Ej. Entrada principal"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-[#3150D8]"
                  />
                </label>
              </div>

              <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4">
                <button type="button" onClick={closeEditor} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#3150D8] hover:text-[#3150D8]">
                  <X className="h-4 w-4" />
                  Cancelar
                </button>
                <button type="submit" className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2944C3]">
                  <Save className="h-4 w-4" />
                  Modificar dispositivo
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}

function DispositivosContent() {
  const searchParams = useSearchParams();
  const requestedType = searchParams.get("tipo");
  const initialType = tipos.includes(requestedType) ? requestedType : "Todos";
  return <DevicesInventory key={initialType} initialType={initialType} />;
}

export default function DispositivosPage() {
  return <Suspense fallback={<div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-slate-500">Cargando dispositivos...</div>}><DispositivosContent /></Suspense>;
}
