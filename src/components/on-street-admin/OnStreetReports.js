"use client";

// Reportes On Street: consulta histórica con filtros y exportación —
// distinto del Dashboard (que resume). Reutiliza ParkFacilDataGrid
// (búsqueda, orden, columnas, exportación CSV/XLSX de TODAS las filas
// filtradas, no solo lo visible en pantalla) en vez de construir una
// infraestructura de exportación nueva.
import { useCallback, useEffect, useMemo, useState } from "react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import ParkFacilDataGrid from "@/components/ui/ParkFacilDataGrid";

const money = (v) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(v || 0);
const dt = (v) => (v ? new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(v)) : "—");

const PERIODS = [
  { key: "today", label: "Hoy" },
  { key: "7d", label: "7 días" },
  { key: "month", label: "Mes" },
  { key: "year", label: "Año" },
  { key: "custom", label: "Personalizado" },
];

const REPORT_TYPES = [
  { key: "sesiones", label: "Sesiones" },
  { key: "pagos", label: "Pagos" },
  { key: "ubicaciones", label: "Ubicaciones / Puntos QR" },
  { key: "extensiones", label: "Extensiones" },
];

const STATUS_LABELS = { ACTIVE: "Activa", CLOSED: "Finalizada", EXPIRED: "Vencida" };
const PAYMENT_STATUS_LABEL = { CREATED: "Iniciado", REDIRECTED: "En Webpay", COMMITTING: "Confirmando", COMMITTED: "Pagado", REJECTED: "Rechazado", ABORTED: "Abortado", FAILED: "Fallido" };

function todayIso() { return new Date().toISOString().slice(0, 10); }

function columnsFor(type) {
  if (type === "sesiones") return [
    { key: "operational_number", label: "Sesión" },
    { key: "ubicacion", label: "Ubicación" },
    { key: "phone", label: "Teléfono" },
    { key: "started_at", label: "Inicio", render: dt },
    { key: "purchased_minutes", label: "Minutos", render: (v) => (v ? `${v} min` : "—") },
    { key: "expires_at", label: "Vencimiento", render: (v) => (v ? dt(v) : "Sin vencimiento") },
    { key: "amount_paid", label: "Monto", render: (v) => money(v) },
    { key: "extensionCount", label: "Extensiones" },
    { key: "status", label: "Estado", render: (v) => STATUS_LABELS[v] || v },
  ];
  if (type === "pagos") return [
    { key: "created_at", label: "Fecha/hora", render: (_, row) => dt(row.committed_at || row.created_at) },
    { key: "sessionNumber", label: "Sesión" },
    { key: "ubicacion", label: "Ubicación" },
    { key: "operationType", label: "Tipo", render: (v) => (v === "EXTENSION" ? "Extensión" : v === "INITIAL" ? "Inicial" : "—") },
    { key: "amount", label: "Monto", render: (v) => money(v) },
    { key: "status", label: "Estado", render: (v) => PAYMENT_STATUS_LABEL[v] || v },
    { key: "buy_order", label: "Buy Order" },
    { key: "authorization_code", label: "Código autorización" },
  ];
  if (type === "ubicaciones") return [
    { key: "label", label: "Ubicación" },
    { key: "parkingName", label: "Estacionamiento" },
    { key: "streetName", label: "Calle" },
    { key: "segmentName", label: "Tramo" },
    { key: "sessions", label: "Sesiones" },
    { key: "minutes", label: "Minutos" },
    { key: "revenue", label: "Recaudación", render: (v) => money(v) },
    { key: "extensions", label: "Extensiones" },
  ];
  // extensiones
  return [
    { key: "operational_number", label: "Sesión" },
    { key: "ubicacion", label: "Ubicación" },
    { key: "additional_minutes", label: "Minutos adicionales" },
    { key: "amount", label: "Monto extensión", render: (v) => money(v) },
    { key: "previous_expires_at", label: "Vencimiento anterior", render: dt },
    { key: "new_expires_at", label: "Nuevo vencimiento", render: dt },
    { key: "created_at", label: "Fecha", render: dt },
  ];
}

export default function OnStreetReports() {
  const [type, setType] = useState("sesiones");
  const [period, setPeriod] = useState("7d");
  const [customFrom, setCustomFrom] = useState(todayIso());
  const [customTo, setCustomTo] = useState(todayIso());
  const [companyId, setCompanyId] = useState("");
  const [parkingId, setParkingId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [streetId, setStreetId] = useState("");
  const [segmentId, setSegmentId] = useState("");

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ type, period });
      if (period === "custom") { params.set("from", customFrom); params.set("to", customTo); }
      if (companyId) params.set("companyId", companyId);
      if (parkingId) params.set("parkingId", parkingId);
      if (areaId) params.set("areaId", areaId);
      if (streetId) params.set("streetId", streetId);
      if (segmentId) params.set("segmentId", segmentId);
      const response = await authenticatedFetch(`/api/on-street-qr/reportes?${params}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
      if (!response.ok) throw new Error(body.error || "No fue posible cargar el reporte.");
      setData(body.data);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, [type, period, customFrom, customTo, companyId, parkingId, areaId, streetId, segmentId]);

  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  const options = data?.options || {};
  const areas = useMemo(() => (options.areas || []).filter((a) => !parkingId || a.parkingId === parkingId), [options.areas, parkingId]);
  const streets = useMemo(() => (options.streets || []).filter((s) => !areaId || s.sectorId === areaId), [options.streets, areaId]);
  const segments = useMemo(() => (options.segments || []).filter((s) => !streetId || s.streetId === streetId), [options.segments, streetId]);

  // Deriva columnas/rowIdKey del tipo que realmente corresponde a
  // `data.rows` (data?.type, devuelto por la API), no del estado local
  // `type`: al cambiar de pestaña, `type` cambia de inmediato pero
  // `data.rows` sigue siendo el del reporte anterior hasta que llega la
  // respuesta nueva — usar `type` directamente aquí desincroniza
  // columnas/rowIdKey de las filas todavía visibles y produce keys
  // duplicadas ("undefined") en ParkFacilDataGrid durante ese instante.
  const renderedType = data?.type || type;
  const columns = useMemo(() => columnsFor(renderedType), [renderedType]);

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-[var(--pf-color-onstreet-border)] bg-gradient-to-br from-[var(--pf-color-onstreet-primary-700)] to-[var(--pf-color-onstreet-primary-800)] p-6 text-white shadow-sm">
        <h1 className="text-xl font-black">Reportes On Street</h1>
        <p className="mt-1 text-sm text-white/85">Consulta histórica con filtros, detalle y exportación (Excel / CSV).</p>
      </header>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {REPORT_TYPES.map((t) => (
            <button key={t.key} type="button" onClick={() => setType(t.key)} className={`rounded-full px-4 py-2 text-xs font-semibold transition ${type === t.key ? "bg-[var(--pf-color-onstreet-primary)] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          {PERIODS.map((p) => (
            <button key={p.key} type="button" onClick={() => setPeriod(p.key)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${period === p.key ? "bg-[#041E42] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {p.label}
            </button>
          ))}
        </div>
        {period === "custom" ? (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-slate-600">Desde<input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
            <label className="text-xs font-semibold text-slate-600">Hasta<input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {options.companies?.length ? (
            <FilterSelect label="Empresa" value={companyId} onChange={(v) => { setCompanyId(v); setParkingId(""); }} rows={options.companies} />
          ) : null}
          <FilterSelect label="Estacionamiento" value={parkingId} onChange={(v) => { setParkingId(v); setAreaId(""); setStreetId(""); setSegmentId(""); }} rows={options.parkings} />
          <FilterSelect label="Área" value={areaId} onChange={(v) => { setAreaId(v); setStreetId(""); setSegmentId(""); }} rows={areas} disabled={!parkingId && !options.parkings?.length} />
          <FilterSelect label="Calle" value={streetId} onChange={(v) => { setStreetId(v); setSegmentId(""); }} rows={streets} disabled={!areaId} />
          <FilterSelect label="Tramo" value={segmentId} onChange={setSegmentId} rows={segments} disabled={!streetId} />
        </div>
      </section>

      {error ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">{error}</p> : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        {loading ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">Cargando…</div>
        ) : (
          <ParkFacilDataGrid
            storageKey={`on-street:reportes:${renderedType}`}
            columns={columns}
            rows={data?.rows || []}
            rowIdKey={renderedType === "ubicaciones" ? "key" : "id"}
            emptyMessage="Sin datos para el período y filtros seleccionados."
            exportFilename={`on_street_reporte_${renderedType}`}
            exportSheetName={REPORT_TYPES.find((t) => t.key === renderedType)?.label || "Reporte"}
          />
        )}
      </section>

      <section className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
        <p><strong>Operadores</strong>: no se implementa como tipo de reporte todavía — el modelo actual no registra qué operador atendió cada sesión.</p>
        <p className="mt-1"><strong>SMS</strong>: disponible al activar recordatorios SMS.</p>
      </section>
    </div>
  );
}

function FilterSelect({ label, value, onChange, rows, disabled }) {
  return (
    <label className="text-xs font-semibold text-slate-600">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-100">
        <option value="">Todos</option>
        {(rows || []).map((row) => <option key={row.id} value={row.id}>{row.name || row.code}</option>)}
      </select>
    </label>
  );
}
