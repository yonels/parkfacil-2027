"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search, X } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import NotificationsTable from "@/components/notificaciones/NotificationsTable";
import { CHANNEL_LABELS, NOTIFICATION_CHANNELS, NOTIFICATION_STATUSES, NOTIFICATION_TYPES, STATUS_LABELS, TYPE_LABELS } from "@/lib/notifications/constants";

const blankFilters = { search: "", channel: "", status: "", type: "", date_from: "", date_to: "" };
const pageSize = 25;

function buildQuery(filters, page) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("page_size", String(pageSize));
  Object.entries(filters).forEach(([key, value]) => {
    if (String(value || "").trim()) params.set(key, value);
  });
  return params;
}

function SummaryCard({ label, value }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-[#041E42]">{value}</p></div>;
}

export default function NotificationsClient() {
  const [filters, setFilters] = useState(blankFilters);
  const [page, setPage] = useState(1);
  const [notifications, setNotifications] = useState([]);
  const [summary, setSummary] = useState({ total: 0, pending: 0, sent: 0, delivered: 0, failed: 0 });
  const [pagination, setPagination] = useState({ page: 1, pageSize, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [unavailable, setUnavailable] = useState(false);

  const query = useMemo(() => buildQuery(filters, page), [filters, page]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/notificaciones?${query.toString()}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "No fue posible cargar las notificaciones.");
      setNotifications(Array.isArray(body.data) ? body.data : []);
      setSummary(body.summary || { total: 0, pending: 0, sent: 0, delivered: 0, failed: 0 });
      setPagination(body.pagination || { page, pageSize, total: 0, totalPages: 1 });
      setUnavailable(Boolean(body.unavailable));
      setError(null);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setLoading(false);
    }
  }, [page, query]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [refresh]);

  const updateFilter = (key, value) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const clearFilters = () => {
    setPage(1);
    setFilters(blankFilters);
  };

  return (
    <AppShell title="Notificaciones" description="Historial multicanal y trazabilidad de comunicaciones">
      <div className="space-y-5">
        <PageHeader title="Centro de Notificaciones" description="Consulte el estado y la trazabilidad de las comunicaciones generadas por ParkFacil." actions={[
          <Link key="volver" href="/" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#041E42] transition hover:border-[#3150D8] hover:text-[#3150D8]"><ArrowLeft className="h-4 w-4" />Volver</Link>,
        ]} />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryCard label="Total" value={summary.total || 0} />
          <SummaryCard label="Pendientes" value={summary.pending || 0} />
          <SummaryCard label="Enviadas" value={summary.sent || 0} />
          <SummaryCard label="Entregadas" value={summary.delivered || 0} />
          <SummaryCard label="Fallidas" value={summary.failed || 0} />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[1.5fr_180px_180px_220px_150px_150px_auto]">
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"><Search className="h-4 w-4 text-[#3150D8]" /><input value={filters.search} onChange={(event) => updateFilter("search", event.target.value)} placeholder="Buscar destinatario, asunto o proveedor" className="w-full bg-transparent outline-none" /></label>
            <select value={filters.channel} onChange={(event) => updateFilter("channel", event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"><option value="">Todos los canales</option>{NOTIFICATION_CHANNELS.map((item) => <option key={item} value={item}>{CHANNEL_LABELS[item]}</option>)}</select>
            <select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"><option value="">Todos los estados</option>{NOTIFICATION_STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}</select>
            <select value={filters.type} onChange={(event) => updateFilter("type", event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"><option value="">Todos los tipos</option>{NOTIFICATION_TYPES.map((item) => <option key={item} value={item}>{TYPE_LABELS[item]}</option>)}</select>
            <input type="date" value={filters.date_from} onChange={(event) => updateFilter("date_from", event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
            <input type="date" value={filters.date_to} onChange={(event) => updateFilter("date_to", event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
            <button type="button" onClick={clearFilters} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#041E42]"><X className="h-4 w-4" />Limpiar filtros</button>
          </div>

          {unavailable ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">La migración de notificaciones aún no está aplicada. El centro queda disponible y mostrará datos cuando exista la tabla remota.</div> : null}
          {error ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error.message}</div> : null}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
            <span>Mostrando {pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1}-{Math.min(pagination.total, pagination.page * pagination.pageSize)} de {pagination.total} notificaciones</span>
            <div className="flex items-center gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-xl border border-slate-200 px-3 py-2 font-semibold disabled:opacity-40">Anterior</button><span>Página {pagination.page} de {pagination.totalPages}</span><button type="button" disabled={page >= pagination.totalPages} onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))} className="rounded-xl border border-slate-200 px-3 py-2 font-semibold disabled:opacity-40">Siguiente</button></div>
          </div>

          <div className="mt-4">
            {loading ? <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-600">Cargando notificaciones...</div> : notifications.length > 0 ? <NotificationsTable notifications={notifications} /> : <EmptyState title="No hay notificaciones" description="No existen comunicaciones para los filtros seleccionados." action={null} />}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
