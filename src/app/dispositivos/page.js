"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import DispositivoResumen from "@/components/dispositivos/DispositivoResumen";
import DispositivosGrid from "@/components/dispositivos/DispositivosGrid";
import { getDispositivosDemo, searchDispositivos } from "@/data/dispositivos.mjs";
import { getEstacionamientosDemo } from "@/data/estacionamientos.mjs";

const dispositivos = getDispositivosDemo();
const estacionamientos = getEstacionamientosDemo();
const tipos = ["Todos", "Cámara LPR", "Barrera", "Terminal POS", "Impresora", "Lector QR", "Sensor", "Controlador de acceso", "Cajero automático", "Computador", "Dispositivo Android"];
const estados = ["Todos", "active", "inactive", "maintenance", "retired"];
const conexiones = ["Todos", "online", "offline", "warning", "unknown"];

function labelEstado(estado) {
  const labels = {
    active: "Activo",
    inactive: "Inactivo",
    maintenance: "Mantenimiento",
    retired: "Retirado",
  };

  return labels[estado] ?? estado;
}

export default function DispositivosPage() {
  const [busqueda, setBusqueda] = useState("");
  const [tipo, setTipo] = useState("Todos");
  const [estado, setEstado] = useState("Todos");
  const [conexion, setConexion] = useState("Todos");
  const [estacionamiento, setEstacionamiento] = useState("Todos");

  const resultados = useMemo(() => {
    const base = searchDispositivos(busqueda);

    return base.filter((dispositivo) => {
      const matchesTipo = tipo === "Todos" || dispositivo.tipo === tipo;
      const matchesEstado = estado === "Todos" || dispositivo.estado === estado;
      const matchesConexion = conexion === "Todos" || dispositivo.conexion === conexion;
      const matchesEstacionamiento = estacionamiento === "Todos" || dispositivo.estacionamientoId === estacionamiento;
      return matchesTipo && matchesEstado && matchesConexion && matchesEstacionamiento;
    });
  }, [busqueda, tipo, estado, conexion, estacionamiento]);

  const resumen = {
    total: dispositivos.length,
    conectados: dispositivos.filter((item) => item.conexion === "online").length,
    desconectados: dispositivos.filter((item) => item.conexion === "offline").length,
    mantenimiento: dispositivos.filter((item) => item.estado === "maintenance").length,
    alertas: dispositivos.filter((item) => item.alertas.some((alerta) => alerta !== "Sin alertas")).length,
  };

  return (
    <AppShell title="Dispositivos" description="Inventario tecnológico de referencia para ParkFacil">
      <div className="space-y-6">
        <PageHeader
          title="Dispositivos"
          description="Inventario tecnológico de referencia de ParkFacil, orientado a la estructuración visual del módulo y su relación con los estacionamientos."
          actions={[
            <button key="nuevo" className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1E5EFF]">
              <Plus className="h-4 w-4" />
              Nuevo dispositivo
            </button>,
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

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {resultados.length > 0 ? (
              <DispositivosGrid dispositivos={resultados} />
            ) : (
              <div className="md:col-span-2 xl:col-span-3 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
                No hay dispositivos que coincidan con los filtros actuales.
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
