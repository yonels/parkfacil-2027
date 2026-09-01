"use client";
// Administración del catálogo de códigos de Estacionamiento/Proyecto
// (corrección funcional 2026-08-29 + continuación "Administración Root del
// catálogo"). Reutiliza EXACTAMENTE el mismo catálogo/API del turno
// anterior (parking_code_catalog, /api/administracion/codigos-estacionamiento)
// -- solo se agrega Inactivar/Reactivar y se cambia la lista a
// ParkFacilDataGrid.
import { useCallback, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import AppShell from "@/components/layout/AppShell";
import ParkFacilDataGrid from "@/components/ui/ParkFacilDataGrid";

const STATUS_LABEL = { AVAILABLE: "Disponible", ASSIGNED: "Asignado", INACTIVE: "Inactivo" };
const STATUS_BADGE = { AVAILABLE: "bg-emerald-100 text-emerald-700", ASSIGNED: "bg-blue-100 text-blue-700", INACTIVE: "bg-slate-200 text-slate-600" };
const dt = (v) => (v ? new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(v)) : "—");

export default function ParkingCodeCatalogAdmin() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [nuevoCodigo, setNuevoCodigo] = useState("");
  const [creando, setCreando] = useState(false);
  const [createError, setCreateError] = useState("");
  const [actionBusyId, setActionBusyId] = useState(null);
  const [actionError, setActionError] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await authenticatedFetch("/api/administracion/codigos-estacionamiento", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible cargar el catálogo de códigos.");
      setRows(body.data || []);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void cargar(), 0); return () => window.clearTimeout(timer); }, [cargar]);

  async function agregarCodigo(event) {
    event.preventDefault();
    setCreando(true); setCreateError("");
    try {
      const response = await authenticatedFetch("/api/administracion/codigos-estacionamiento", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: nuevoCodigo }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible agregar el código.");
      setNuevoCodigo("");
      setModalOpen(false);
      await cargar();
    } catch (cause) {
      setCreateError(cause.message);
    } finally {
      setCreando(false);
    }
  }

  async function cambiarEstado(row, action) {
    setActionBusyId(row.id); setActionError("");
    try {
      const response = await authenticatedFetch(`/api/administracion/codigos-estacionamiento/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible actualizar el código.");
      await cargar();
    } catch (cause) {
      setActionError(cause.message);
    } finally {
      setActionBusyId(null);
    }
  }

  const disponibles = rows.filter((r) => r.status === "AVAILABLE").length;

  const columns = [
    { key: "code", label: "Código", render: (value) => <span className="font-mono font-semibold text-[#3150D8]">{value}</span> },
    { key: "status", label: "Estado", render: (value) => <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_BADGE[value] || "bg-slate-100 text-slate-600"}`}>{STATUS_LABEL[value] || value}</span> },
    { key: "parkingName", label: "Estacionamiento", getValue: (row) => row.parking?.name || null, render: (value) => value || "—" },
    { key: "companyName", label: "Empresa", getValue: (row) => row.parking?.companyName || null, render: (value) => value || "—" },
    { key: "createdAt", label: "Fecha de creación", render: (value) => dt(value) },
    {
      key: "actions", label: "", sortable: false, render: (_, row) => {
        if (row.status === "AVAILABLE") {
          return <button type="button" disabled={actionBusyId === row.id} onClick={() => cambiarEstado(row, "inactivate")} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-50">{actionBusyId === row.id ? "…" : "Inactivar"}</button>;
        }
        if (row.status === "INACTIVE") {
          return <button type="button" disabled={actionBusyId === row.id} onClick={() => cambiarEstado(row, "reactivate")} className="rounded-full border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-50">{actionBusyId === row.id ? "…" : "Reactivar"}</button>;
        }
        // ASSIGNED: sin acciones -- no se puede inactivar, reasignar ni eliminar (definición aprobada).
        return null;
      },
    },
  ];

  return (
    <AppShell title="Códigos de Estacionamiento" description="Catálogo global de códigos de Estacionamiento/Proyecto (Root)">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm text-slate-600">Estos códigos alimentan el selector de &ldquo;Nuevo estacionamiento&rdquo; (On Street y Off Street). Un código pasa a &ldquo;Asignado&rdquo; automáticamente al usarse para crear un estacionamiento — no se puede reasignar, cambiar ni eliminar.</p>
          <button type="button" onClick={() => { setModalOpen(true); setCreateError(""); }} className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-5 py-2.5 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Nuevo código</button>
        </div>

        {error ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p> : null}
        {actionError ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{actionError}</p> : null}

        <div className="rounded-3xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{disponibles} código{disponibles === 1 ? "" : "s"} disponible{disponibles === 1 ? "" : "s"} de {rows.length} en total.</div>

        {loading ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">Cargando…</div>
        ) : (
          <ParkFacilDataGrid
            storageKey="administracion:codigos-estacionamiento"
            columns={columns}
            rows={rows}
            globalSearchPlaceholder="Buscar código, estacionamiento o empresa..."
            emptyMessage="Todavía no hay códigos en el catálogo."
            exportFilename="codigos_estacionamiento"
            exportSheetName="Códigos"
          />
        )}
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#041E42]">Nuevo código de estacionamiento</h3>
              <button type="button" onClick={() => setModalOpen(false)} aria-label="Cerrar" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={agregarCodigo} className="space-y-4">
              <label className="block space-y-1.5 text-sm font-medium text-slate-700">
                <span>Código</span>
                <input autoFocus value={nuevoCodigo} onChange={(e) => setNuevoCodigo(e.target.value)} placeholder="Ej: PF-010" className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#3150D8]" />
              </label>
              {createError ? <p role="alert" className="text-sm font-medium text-rose-700">{createError}</p> : null}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModalOpen(false)} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold">Cancelar</button>
                <button type="submit" disabled={creando || !nuevoCodigo.trim()} className="rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{creando ? "Agregando…" : "Agregar código"}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
