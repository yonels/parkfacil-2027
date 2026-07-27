"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, FileInput, FileSpreadsheet, RefreshCw, Search, Upload, Users, X } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import AbonadosTabla from "@/components/abonados/AbonadosTabla";
import { getEstadoAbonadoLabel } from "@/data/abonados.mjs";

const estados = ["Todos", "active", "inactive", "suspended", "pending", "blocked"];
const limits = [25, 50, 100];

function buildQuery({ page, limit, search, estado, sortKey, sortDirection }) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(limit));
  if (search.trim()) params.set("search", search.trim());
  if (estado !== "Todos") params.set("estado", estado);
  if (sortKey) params.set("sort", sortKey);
  if (sortDirection) params.set("direction", sortDirection);
  return params;
}

function downloadUrl(url) {
  const link = document.createElement("a");
  link.href = url;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export default function AbonadosClient() {
  const fileInputRef = useRef(null);
  const [abonados, setAbonados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState("Todos");
  const [sortKey, setSortKey] = useState("codigo");
  const [sortDirection, setSortDirection] = useState("asc");
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const query = useMemo(() => buildQuery({ page, limit, search, estado, sortKey, sortDirection }), [page, limit, search, estado, sortKey, sortDirection]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/abonados?${query.toString()}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "No fue posible cargar los abonados.");
      setAbonados(Array.isArray(body.data) ? body.data : []);
      setTotal(Number(body.total || 0));
      setTotalPages(Number(body.totalPages || 1));
      setError(null);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [refresh]);

  const toggleSort = (key) => {
    setPage(1);
    if (sortKey !== key) {
      setSortKey(key);
      setSortDirection("asc");
      return;
    }
    setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
  };

  const exportFiltered = () => {
    downloadUrl(`/api/abonados/exportar?${query.toString()}`);
  };

  const downloadTemplate = () => {
    downloadUrl("/api/abonados/plantilla");
  };

  const validateImport = async (file) => {
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await fetch("/api/abonados/importar/validar", { method: "POST", body: formData });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "No fue posible validar el archivo.");
      setPreview(body);
    } catch (requestError) {
      setPreview({ fileName: file.name, summary: { total: 0, valid: 0, warnings: 0, errors: 1, create: 0, update: 0, unchanged: 0, ignored: 0 }, rows: [], errors: [{ row: 0, field: "Archivo", value: "", message: requestError.message }] });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const confirmImport = async () => {
    if (!preview?.rows?.length) return;
    setImporting(true);
    try {
      const response = await fetch("/api/abonados/importar/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: preview.rows }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "No fue posible confirmar la importacion.");
      setImportResult(body);
      await refresh();
    } catch (requestError) {
      setImportResult({ total: 0, created: 0, updated: 0, skipped: 0, errors: 1, results: [{ row: 0, status: "Error", message: requestError.message }] });
    } finally {
      setImporting(false);
    }
  };

  const downloadErrors = async () => {
    if (!preview?.errors?.length) return;
    const response = await fetch("/api/abonados/importar/errores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ errors: preview.errors }),
    });
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    downloadUrl(url);
    window.URL.revokeObjectURL(url);
  };

  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(total, page * limit);

  return (
    <AppShell title="Abonados" description="Gestion tabular de personas, vehiculos y credenciales con persistencia en Supabase">
      <div className="space-y-5">
        <PageHeader
          title="Abonados"
          description="Vista compacta tipo planilla para administrar grandes volumenes de abonados con exportacion e importacion Excel."
          actions={[<Link key="nuevo" href="/abonados/nuevo" className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1E5EFF]"><Users className="h-4 w-4" />Nuevo abonado</Link>]}
        />

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <Link href="/abonados/nuevo" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#3150D8] px-3 py-2 text-sm font-semibold text-white"><Users className="h-4 w-4" />Nuevo abonado</Link>
              <button type="button" onClick={exportFiltered} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#041E42]"><FileSpreadsheet className="h-4 w-4" />Exportar Excel</button>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#041E42]"><Upload className="h-4 w-4" />Importar Excel</button>
              <button type="button" onClick={downloadTemplate} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#041E42]"><Download className="h-4 w-4" />Descargar plantilla</button>
              <button type="button" onClick={refresh} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#041E42]"><RefreshCw className="h-4 w-4" />Actualizar listado</button>
              <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={(event) => void validateImport(event.target.files?.[0])} />
            </div>
            <StatusBadge variant="positive">Supabase</StatusBadge>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_180px_160px]">
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <Search className="h-4 w-4 text-[#3150D8]" />
              <input value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder="Buscar codigo, nombre, RUT, correo o telefono" className="w-full bg-transparent outline-none" />
            </label>
            <select value={estado} onChange={(event) => { setPage(1); setEstado(event.target.value); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none">
              {estados.map((item) => <option key={item} value={item}>{item === "Todos" ? "Todos los estados" : getEstadoAbonadoLabel(item)}</option>)}
            </select>
            <select value={limit} onChange={(event) => { setPage(1); setLimit(Number(event.target.value)); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none">
              {limits.map((item) => <option key={item} value={item}>{item} por pagina</option>)}
            </select>
          </div>

          {error ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error.message}</div> : null}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
            <span>Mostrando {start}-{end} de {total} abonados</span>
            <div className="flex items-center gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-xl border border-slate-200 px-3 py-2 font-semibold disabled:opacity-40">Anterior</button>
              <span>Pagina {page} de {totalPages}</span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="rounded-xl border border-slate-200 px-3 py-2 font-semibold disabled:opacity-40">Siguiente</button>
            </div>
          </div>

          <div className="mt-4">
            {loading ? <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-600">Cargando abonados...</div> : abonados.length > 0 ? <AbonadosTabla abonados={abonados} sortKey={sortKey} sortDirection={sortDirection} onSort={toggleSort} /> : <EmptyState title="No hay abonados" description="No existen abonados para los filtros aplicados." action={null} />}
          </div>
        </section>

        {preview ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <section className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-2xl bg-white p-5 shadow-xl" role="dialog" aria-modal="true" aria-label="Previsualizacion de importacion">
              <div className="flex items-start justify-between gap-3">
                <div><h2 className="text-lg font-semibold text-[#041E42]">Previsualizacion de importacion</h2><p className="mt-1 text-sm text-slate-600">{preview.fileName}</p></div>
                <button type="button" onClick={() => { setPreview(null); setImportResult(null); }} className="rounded-xl border border-slate-200 p-2" aria-label="Cerrar"><X className="h-4 w-4" /></button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6 text-sm">
                <div>Total: <strong>{preview.summary?.total || 0}</strong></div><div>Validas: <strong>{preview.summary?.valid || 0}</strong></div><div>Errores: <strong>{preview.summary?.errors || 0}</strong></div><div>Crear: <strong>{preview.summary?.create || 0}</strong></div><div>Actualizar: <strong>{preview.summary?.update || 0}</strong></div><div>Ignorar: <strong>{preview.summary?.ignored || 0}</strong></div>
              </div>
              <div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-xs"><thead><tr className="border-b text-slate-500"><th className="px-2 py-2">Fila Excel</th><th className="px-2 py-2">Codigo</th><th className="px-2 py-2">Nombre</th><th className="px-2 py-2">RUT</th><th className="px-2 py-2">Accion</th><th className="px-2 py-2">Estado</th><th className="px-2 py-2">Mensaje</th></tr></thead><tbody>{(preview.rows || []).slice(0, 100).map((row) => <tr key={row.row} className="border-b"><td className="px-2 py-2">{row.row}</td><td className="px-2 py-2">{row.codigo}</td><td className="px-2 py-2">{row.nombre}</td><td className="px-2 py-2">{row.rut}</td><td className="px-2 py-2">{row.action}</td><td className="px-2 py-2">{row.status === "valid" ? "Valida" : "Error"}</td><td className="px-2 py-2">{row.message}</td></tr>)}</tbody></table></div>
              {importResult ? <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Procesados: {importResult.total}. Creados: {importResult.created}. Actualizados: {importResult.updated}. Errores: {importResult.errors}.</div> : null}
              <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={importing || !preview.summary?.valid} onClick={confirmImport} className="inline-flex items-center gap-2 rounded-xl bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300"><FileInput className="h-4 w-4" />Confirmar importacion</button>{preview.errors?.length ? <button type="button" onClick={downloadErrors} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">Descargar informe</button> : null}<button type="button" onClick={() => setPreview(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">Cerrar</button></div>
            </section>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
