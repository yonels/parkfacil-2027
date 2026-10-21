"use client";

// Dashboard On Street: KPIs, series y rankings propios del módulo (no es el
// dashboard general de ParkFacil con textos cambiados — ver auditoría en el
// informe). Funciona igual en Portal Root y Portal Cliente: el backend
// (getOnStreetDashboardOverview) impone el aislamiento por empresa
// server-side; el selector "Empresa" solo aparece si el backend devolvió
// más de una opción (Root), nunca por un cálculo hecho en el navegador.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, AlertTriangle, Info as InfoIcon, MessageSquareOff } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import ParkFacilDataGrid from "@/components/ui/ParkFacilDataGrid";

const money = (v) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(v || 0);
const pct = (v) => `${Math.round((v || 0) * 100)}%`;
const dt = (v) => (v ? new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(v)) : "—");
const dayLabel = (iso) => new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "2-digit" }).format(new Date(`${iso}T12:00:00`));

const PERIODS = [
  { key: "today", label: "Hoy" },
  { key: "7d", label: "7 días" },
  { key: "month", label: "Mes" },
  { key: "year", label: "Año" },
  { key: "custom", label: "Personalizado" },
];

const STATUS_LABELS = { ACTIVE: "Activa", CLOSED: "Finalizada", EXPIRED: "Vencida" };
const GROUP_BY_OPTIONS = [
  { key: "qrLocation", label: "Ubicación QR" },
  { key: "segment", label: "Tramo" },
  { key: "street", label: "Calle" },
  { key: "area", label: "Área" },
  { key: "parking", label: "Estacionamiento" },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function OnStreetDashboard() {
  const router = useRouter();
  const [period, setPeriod] = useState("today");
  const [customFrom, setCustomFrom] = useState(todayIso());
  const [customTo, setCustomTo] = useState(todayIso());
  const [companyId, setCompanyId] = useState("");
  const [parkingId, setParkingId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [streetId, setStreetId] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [sortBy, setSortBy] = useState("revenue");
  const [groupBy, setGroupBy] = useState("qrLocation");

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ period, placeSortBy: sortBy, groupBy });
      if (period === "custom") { params.set("from", customFrom); params.set("to", customTo); }
      if (companyId) params.set("companyId", companyId);
      if (parkingId) params.set("parkingId", parkingId);
      if (areaId) params.set("areaId", areaId);
      if (streetId) params.set("streetId", streetId);
      if (segmentId) params.set("segmentId", segmentId);
      const response = await authenticatedFetch(`/api/on-street-qr/dashboard/overview?${params}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
      if (!response.ok) throw new Error(body.error || "No fue posible cargar el dashboard.");
      setData(body.data);
      setUpdatedAt(new Date());
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, [period, customFrom, customTo, companyId, parkingId, areaId, streetId, segmentId, sortBy, groupBy]);

  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  // Interactividad (2026-08-30: "cada uno de los datos del dashboard debe
  // ser clickeable"): cada KPI/gráfico/fila salta a Reportes On Street
  // (que ya tiene el detalle paginado/exportable + la pestaña Gráficos),
  // en la pestaña que corresponda, CONSERVANDO los filtros activos del
  // Dashboard (período/Empresa/Estacionamiento/Área/Calle/Tramo -- los
  // mismos ?period=/companyId=/parkingId=/areaId=/streetId=/segmentId=
  // que OnStreetReports.js ya lee, ver ese archivo) y aplicando además el
  // filtro de clic específico del dato (patch: status/approval/
  // paymentType/operationType/day). No se duplica ninguna tabla/lógica
  // nueva -- Reportes ya resuelve todo esto con los mismos endpoints.
  const goToReportes = useCallback((tab, patch = {}) => {
    const params = new URLSearchParams({ tab, period });
    if (period === "custom") { params.set("from", customFrom); params.set("to", customTo); }
    if (companyId) params.set("companyId", companyId);
    if (parkingId) params.set("parkingId", parkingId);
    if (areaId) params.set("areaId", areaId);
    if (streetId) params.set("streetId", streetId);
    if (segmentId) params.set("segmentId", segmentId);
    Object.entries(patch).forEach(([key, value]) => { if (value) params.set(key, value); });
    router.push(`/on-street-qr/reportes?${params}`);
  }, [router, period, customFrom, customTo, companyId, parkingId, areaId, streetId, segmentId]);

  // Clic en una fila de "Rendimiento por lugar": el filtro a aplicar
  // depende de qué nivel de jerarquía está agrupando la tabla ahora mismo
  // (groupBy) -- "row.key" es el id de ESE nivel (ver GROUP_RESOLVERS en
  // onStreetDashboardCore.mjs, la misma función que arma esta tabla).
  const goToPlaceRow = useCallback((row) => {
    const filterKey = { parking: "parkingId", area: "areaId", street: "streetId", segment: "segmentId", qrLocation: "segmentId" }[groupBy] || "segmentId";
    goToReportes("sesiones", { [filterKey]: row.key });
  }, [groupBy, goToReportes]);

  const options = data?.options || {};
  const areas = useMemo(() => (options.areas || []).filter((a) => !parkingId || a.parkingId === parkingId), [options.areas, parkingId]);
  const streets = useMemo(() => (options.streets || []).filter((s) => !areaId || s.sectorId === areaId), [options.streets, areaId]);
  const segments = useMemo(() => (options.segments || []).filter((s) => !streetId || s.streetId === streetId), [options.segments, streetId]);

  const activeSessionsColumns = useMemo(() => [
    { key: "operational_number", label: "Sesión" },
    { key: "license_plate_normalized", label: "Patente", render: (v) => v || "—" },
    { key: "location", label: "Ubicación", getValue: (r) => r.location?.label, render: (v) => v || "—" },
    { key: "phone", label: "Teléfono" },
    { key: "started_at", label: "Inicio", render: dt },
    { key: "purchased_minutes", label: "Minutos", render: (v) => (v ? `${v} min` : "—") },
    { key: "expires_at", label: "Vencimiento", render: (v) => (v ? dt(v) : "Sin vencimiento") },
    { key: "amount_paid", label: "Monto", render: (v) => money(v) },
  ], []);

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-[var(--pf-color-onstreet-border)] bg-gradient-to-br from-[var(--pf-color-onstreet-primary-800)] to-[var(--pf-color-onstreet-primary-700)] p-6 text-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-black">Dashboard On Street</h1>
            <p className="mt-1 text-sm text-white/85">Operación, sesiones y recaudación de estacionamientos QR</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-white/85">
            {updatedAt ? <span>Actualizado {dt(updatedAt)}</span> : null}
            <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 font-semibold text-white transition hover:bg-white/20 disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
            </button>
          </div>
        </div>
      </header>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((p) => (
            <button key={p.key} type="button" onClick={() => setPeriod(p.key)} className={`rounded-full px-4 py-2 text-xs font-semibold transition ${period === p.key ? "bg-[var(--pf-color-onstreet-primary)] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
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

      {data ? (
        <>
          {/* Métrica financiera oficial (§19 de la auditoría 2026-08-28):
              "Recaudación" (el KPI destacado) es SIEMPRE revenueBreakdown.total
              -- suma de payment_transactions.status='COMMITTED' por fecha del
              evento financiero (committed_at), la única fuente de verdad de
              ingresos del módulo (§3/§18). El monto asociado a sesiones por
              fecha de INICIO de sesión (antes etiquetado también
              "Recaudación", causando dos totales aparentemente contradictorios)
              se muestra aparte, con una etiqueta que aclara su alcance real:
              nunca dos números bajo el mismo nombre "Ingresos". */}
          <KpiGrid
            items={[
              { label: "Sesiones activas ahora", value: data.kpis.activeSessionsNow, onClick: () => goToReportes("sesiones", { status: "ACTIVE" }) },
              { label: "Sesiones del período", value: data.kpis.sessionsInPeriod, onClick: () => goToReportes("sesiones") },
              { label: "Recaudación (pagos confirmados)", value: money(data.revenueBreakdown.total), onClick: () => goToReportes("pagos", { approval: "approved" }) },
              { label: "Minutos contratados", value: data.kpis.minutesPurchased, onClick: () => goToReportes("sesiones") },
              { label: "Extensiones", value: data.kpis.extensionsCount, onClick: () => goToReportes("extensiones") },
              { label: "Ticket promedio", value: money(data.kpis.averageTicket), onClick: () => goToReportes("pagos", { approval: "approved" }) },
            ]}
          />
          <KpiGrid
            items={[
              { label: "Tiempo promedio contratado", value: `${data.kpis.averageMinutesPerSession} min`, onClick: () => goToReportes("sesiones") },
              { label: "Monto asociado a sesiones (por fecha de inicio)", value: money(data.kpis.revenue), onClick: () => goToReportes("sesiones") },
              { label: "Pagos aprobados", value: data.kpis.paymentsApproved, onClick: () => goToReportes("pagos", { approval: "approved" }) },
              { label: "Pagos Rechazados", value: data.kpis.paymentsRejected, onClick: () => goToReportes("pagos", { approval: "rejected" }) },
              { label: "Tasa de aprobación Webpay", value: pct(data.kpis.approvalRate), onClick: () => goToReportes("pagos") },
            ]}
          />
          <KpiGrid
            items={[
              { label: "Ingresos por pago inicial", value: money(data.revenueBreakdown.initial), onClick: () => goToReportes("pagos", { operationType: "INITIAL" }) },
              { label: "Ingresos por extensiones", value: money(data.revenueBreakdown.extension), onClick: () => goToReportes("pagos", { operationType: "EXTENSION" }) },
              { label: "Sesiones por vencer (≤15 min)", value: data.soonToExpire, onClick: () => goToReportes("sesiones", { status: "ACTIVE" }) },
            ]}
          />
          <p className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
            <strong>Nota sobre las dos métricas de recaudación:</strong> «Recaudación (pagos confirmados)» atribuye cada pago a la fecha/hora en que Transbank lo autorizó (committed_at) — es la métrica financiera oficial. «Monto asociado a sesiones (por fecha de inicio)» atribuye el mismo dinero a la fecha en que comenzó la sesión (started_at) — útil para analizar sesiones, no para conciliar caja. Para una sesión que inicia un día y extiende su tiempo al día siguiente, ambos totales pueden no coincidir exactamente por período: no es un error ni una doble contabilización, son dos fechas distintas del mismo dinero.
          </p>

          <div className="grid gap-6 xl:grid-cols-2">
            <ChartCard title="Sesiones por día" subtitle="Clic en una barra abre Sesiones filtrado a ese día.">
              <BarChart data={data.sessionsByDay} xKey="day" yKey="count" formatX={dayLabel} color="var(--pf-color-onstreet-primary)" onBarClick={(row) => goToReportes("sesiones", { day: row.day })} />
            </ChartCard>
            <ChartCard title="Evolución de ingresos" subtitle={`Solo pagos COMMITTED, por hora de autorización. Granularidad automática: ${{ hour: "por hora", day: "por día", month: "por mes" }[data.revenueTimeSeries.granularity] || data.revenueTimeSeries.granularity}. Clic abre Pagos aprobados${data.revenueTimeSeries.granularity === "day" ? ", filtrado a ese día" : ""}.`}>
              <BarChart data={data.revenueTimeSeries.points} xKey="bucket" yKey="amount" formatX={(v) => (data.revenueTimeSeries.granularity === "hour" ? String(v).slice(11, 16) : data.revenueTimeSeries.granularity === "month" ? String(v) : dayLabel(v))} formatY={money} color="#059669" onBarClick={(row) => goToReportes("pagos", { approval: "approved", ...(data.revenueTimeSeries.granularity === "day" ? { day: row.bucket } : {}) })} />
            </ChartCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <ChartCard title="Recaudación por hora del día" subtitle="En qué horarios se concentra la recaudación (todo el período, agrupado por hora-del-día del pago COMMITTED). Clic abre Pagos aprobados.">
              <BarChart data={data.revenueByHourOfDay} xKey="hour" yKey="amount" formatX={(h) => `${String(h).padStart(2, "0")}h`} formatY={money} color="#0EA5E9" onBarClick={() => goToReportes("pagos", { approval: "approved" })} />
            </ChartCard>
            <ChartCard title="Duración de estacionamiento" subtitle="CLOSED: duración real al cerrar. EXPIRED: vencimiento−inicio. ACTIVE: transcurrido hasta ahora. Clic abre Sesiones.">
              <BarChart data={data.durationDistribution} xKey="label" yKey="count" color="#F59E0B" onBarClick={() => goToReportes("sesiones")} />
            </ChartCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <ChartCard title="Minutos contratados" subtitle="Distribución analítica — la contratación sigue permitiendo de 1 a 1.440 minutos. Clic abre Sesiones.">
              <BarChart data={data.minutesDistribution} xKey="label" yKey="count" color="#7C3AED" onBarClick={() => goToReportes("sesiones")} />
            </ChartCard>
            <ChartCard title="Extensiones de estadía">
              <div className="grid grid-cols-3 gap-3 text-center">
                <MiniStat label="Sin extensión" value={data.extensions.none} onClick={() => goToReportes("sesiones")} />
                <MiniStat label="Una extensión" value={data.extensions.one} onClick={() => goToReportes("extensiones")} />
                <MiniStat label="Múltiples" value={data.extensions.many} onClick={() => goToReportes("extensiones")} />
              </div>
              <p className="mt-4 text-center text-sm text-slate-600">
                <span className="text-2xl font-black text-[var(--pf-color-onstreet-primary)]">{pct(data.extensions.extensionsRate)}</span> de sesiones extendidas · <span className="font-bold">{money(data.revenueBreakdown.extension)}</span> en ingresos por extensión
              </p>
            </ChartCard>
          </div>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-[#041E42]">Rendimiento por lugar</h2>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-semibold text-slate-600">
                  Agrupar por
                  <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="ml-2 rounded-xl border border-slate-200 px-2 py-1 text-sm">
                    {GROUP_BY_OPTIONS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Ordenar por
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="ml-2 rounded-xl border border-slate-200 px-2 py-1 text-sm">
                    <option value="revenue">Ingresos</option>
                    <option value="sessions">Sesiones</option>
                    <option value="vehicles">Vehículos</option>
                    <option value="averageTicket">Ticket promedio</option>
                    <option value="extensionsCount">Extensiones</option>
                    <option value="fiscalizations">Fiscalizaciones</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500"><tr>{["Lugar", "Vehículos", "Sesiones", "Ingresos", "Ticket prom.", "Duración prom.", "Extensiones", "Ing. extensión", "Fiscalizaciones", "Ocupación"].map((h) => <th key={h} className="border-b border-slate-200 px-3 py-2">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {(data.placePerformance || []).slice(0, 15).map((row) => (
                    <tr key={row.key} onClick={() => goToPlaceRow(row)} className="cursor-pointer hover:bg-slate-50" title="Clic abre Sesiones filtrado a este lugar">
                      <td className="px-3 py-2 font-semibold text-[var(--pf-color-onstreet-primary)]">{row.label}</td>
                      <td className="px-3 py-2 tabular-nums">{row.vehicles}</td>
                      <td className="px-3 py-2 tabular-nums">{row.sessions}</td>
                      <td className="px-3 py-2 tabular-nums">{money(row.revenue)}</td>
                      <td className="px-3 py-2 tabular-nums">{money(row.averageTicket)}</td>
                      <td className="px-3 py-2 tabular-nums">{row.averageDurationMinutes ? `${row.averageDurationMinutes} min` : "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{row.extensionsCount}</td>
                      <td className="px-3 py-2 tabular-nums">{money(row.extensionsRevenue)}</td>
                      <td className="px-3 py-2 tabular-nums">{row.fiscalizations}</td>
                      <td className="px-3 py-2 tabular-nums">{row.occupancy ? `${Math.round(row.occupancy.rate * 100)}% (${row.occupancy.active}/${row.occupancy.capacity})` : "No disponible"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!(data.placePerformance || []).length ? <p className="p-8 text-center text-sm text-slate-500">Sin datos para el período y filtros seleccionados.</p> : null}
            </div>
            <p className="mt-3 text-xs text-slate-500">Ocupación: capacidad real del tramo (parking_street_segments) vs. sesiones ACTIVE en vivo. «No disponible» cuando el tramo no tiene capacidad configurada — nunca se muestra un porcentaje inventado. Ver también el reporte «Rendimiento por lugar» para el detalle completo, paginado y exportable a Excel.</p>
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <ChartCard title="Sesiones por estado" subtitle="Fiscalizada es transversal: una sesión vencida o finalizada puede además estar fiscalizada — no se suma al total de las otras 4 categorías. 'Fiscalizada' no tiene un filtro equivalente en Sesiones, así que no es clickeable (nunca se simula un filtro que no existe).">
              <div className="grid grid-cols-3 gap-3 text-center">
                <MiniStat label="Vigente" value={data.sessionStateBreakdown.VIGENTE} onClick={() => goToReportes("sesiones", { status: "ACTIVE" })} />
                <MiniStat label="Por vencer" value={data.sessionStateBreakdown.POR_VENCER} onClick={() => goToReportes("sesiones", { status: "ACTIVE" })} />
                <MiniStat label="Vencida" value={data.sessionStateBreakdown.VENCIDA} onClick={() => goToReportes("sesiones", { status: "EXPIRED" })} />
                <MiniStat label="Finalizada" value={data.sessionStateBreakdown.FINALIZADA} onClick={() => goToReportes("sesiones", { status: "CLOSED" })} />
                <MiniStat label="Fiscalizada / observada" value={data.sessionStateBreakdown.FISCALIZADA} />
              </div>
            </ChartCard>
            <ChartCard title="Medios de pago" subtitle="Débito/Crédito según el dato oficial de Transbank (payment_type_code). Onepay no es hoy distinguible con los datos que Transbank entrega en la respuesta de Webpay Plus.">
              <div className="grid grid-cols-3 gap-3 text-center">
                <MiniStat label="Débito" value={`${data.paymentMethodBreakdown.DEBIT.count} · ${money(data.paymentMethodBreakdown.DEBIT.amount)}`} onClick={() => goToReportes("pagos", { paymentType: "DEBIT" })} />
                <MiniStat label="Crédito" value={`${data.paymentMethodBreakdown.CREDIT.count} · ${money(data.paymentMethodBreakdown.CREDIT.amount)}`} onClick={() => goToReportes("pagos", { paymentType: "CREDIT" })} />
                <MiniStat label="No informado" value={`${data.paymentMethodBreakdown.UNKNOWN.count} · ${money(data.paymentMethodBreakdown.UNKNOWN.amount)}`} onClick={() => goToReportes("pagos", { paymentType: "UNKNOWN" })} />
              </div>
            </ChartCard>
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-[#041E42]">Webpay</h2>
                <button type="button" onClick={() => router.push("/on-street-qr/pagos")} className="text-sm font-semibold text-[var(--pf-color-onstreet-primary)] hover:underline">Ver pagos →</button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                <MiniStat label="Aprobados" value={data.kpis.paymentsApproved} onClick={() => goToReportes("pagos", { approval: "approved" })} />
                <MiniStat label="Pagos Rechazados" value={data.kpis.paymentsRejected} onClick={() => goToReportes("pagos", { approval: "rejected" })} />
              </div>
            </section>
          </div>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#041E42]">Fiscalizaciones</h2>
              <button type="button" onClick={() => router.push("/on-street-qr/fiscalizaciones")} className="text-sm font-semibold text-[var(--pf-color-onstreet-primary)] hover:underline">Ver fiscalizaciones →</button>
            </div>
            {/* Fiscalizaciones tiene su propia pantalla (/on-street-qr/
                fiscalizaciones, filtros propios) -- Reportes On Street no
                tiene una pestaña "Fiscalizaciones" (fuera de alcance de
                esta tarea), así que el clic va directo a esa pantalla,
                igual que el botón "Ver fiscalizaciones →". */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniStat label="Fiscalizaciones" value={data.inspectionKpis.total} onClick={() => router.push("/on-street-qr/fiscalizaciones")} />
              <MiniStat label="Patentes observadas" value={data.inspectionKpis.distinctPlates} onClick={() => router.push("/on-street-qr/fiscalizaciones")} />
              <MiniStat label="SMS enviados" value={data.inspectionKpis.smsSent} onClick={() => router.push("/on-street-qr/fiscalizaciones")} />
              <MiniStat label="SMS fallidos" value={data.inspectionKpis.smsFailed} onClick={() => router.push("/on-street-qr/fiscalizaciones")} />
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-[#041E42]">Alertas operacionales</h2>
            {data.alerts.length ? (
              <ul className="mt-3 space-y-2">
                {data.alerts.map((alert) => (
                  <li key={alert.id} className={`flex items-center gap-3 rounded-2xl p-3 text-sm ${alert.severity === "warning" ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-800"}`}>
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {alert.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 flex items-center gap-2 text-sm text-slate-500"><InfoIcon className="h-4 w-4" /> Sin alertas para el período seleccionado.</p>
            )}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <MessageSquareOff className="h-5 w-5 text-slate-500" />
              <h2 className="text-lg font-bold text-[#041E42]">SMS previo al vencimiento</h2>
            </div>
            {/* Sin filtro equivalente en Reportes (no hay "estado de
                recordatorio SMS" en Sesiones/Pagos) -- no clickeable, mismo
                criterio que "Fiscalizada" arriba: nunca se simula un filtro
                que no existe. */}
            {data.smsReminderKpis.total ? (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MiniStat label="Programados" value={data.smsReminderKpis.total} />
                <MiniStat label="Enviados" value={data.smsReminderKpis.sent} />
                <MiniStat label="Pendientes" value={data.smsReminderKpis.pending} />
                <MiniStat label="Fallidos" value={data.smsReminderKpis.failed} />
              </div>
            ) : (
              <p className="mt-3 flex items-center gap-2 text-sm text-slate-500"><InfoIcon className="h-4 w-4" /> Sin recordatorios programados en el período seleccionado.</p>
            )}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-[#041E42]">Sesiones activas</h2>
            <div className="mt-4">
              <ParkFacilDataGrid
                storageKey="on-street:dashboard-active"
                columns={activeSessionsColumns}
                rows={data.activeSessions}
                onRowDoubleClick={(r) => router.push(`/on-street-qr/sesiones/${r.id}`)}
                emptyMessage="Sin sesiones activas en este momento."
                exportFilename="on_street_sesiones_activas"
              />
            </div>
          </section>
        </>
      ) : loading ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">Cargando…</div>
      ) : null}
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

// xl:grid-cols-N debe existir como clase literal para que Tailwind la
// genere — no se puede armar el nombre dinámicamente. Se elige según la
// cantidad real de tarjetas para que una fila de 5 no quede comprimida en
// una grilla pensada para 6 (eso era lo que angostaba "Pagos Rechazados").
const XL_COLUMNS = { 4: "xl:grid-cols-4", 5: "xl:grid-cols-5", 6: "xl:grid-cols-6" };

// "items" pasó de tuplas [label, value] a objetos {label, value, onClick}
// (2026-08-30: cada KPI debe ser clickeable) -- "onClick" es siempre
// goToReportes/goToPlaceRow, nunca lógica nueva por tarjeta.
function KpiGrid({ items }) {
  const xlClass = XL_COLUMNS[items.length] || "xl:grid-cols-6";
  return (
    <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${xlClass}`}>
      {items.map(({ label, value, onClick }) => (
        <button key={label} type="button" onClick={onClick} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-[var(--pf-color-onstreet-primary)] hover:shadow-md">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-black tabular-nums text-[#041E42]">{value}</p>
        </button>
      ))}
    </div>
  );
}

// "onClick" opcional (2026-08-30): cuando no hay un filtro real de
// Reportes que aplicar para ese dato (p. ej. "Fiscalizada", que no tiene
// equivalente en el filtro "status" de Sesiones), se omite en vez de
// simular una interactividad que no filtra nada.
function MiniStat({ label, value, onClick }) {
  const content = (
    <>
      <p className="text-2xl font-black tabular-nums text-[#041E42]">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </>
  );
  if (!onClick) return <div className="rounded-2xl bg-slate-50 p-3">{content}</div>;
  return <button type="button" onClick={onClick} className="w-full rounded-2xl bg-slate-50 p-3 text-left transition hover:bg-slate-100">{content}</button>;
}

function ChartCard({ title, subtitle, children }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-[#041E42]">{title}</h2>
      {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// Gráfico de barras liviano en SVG puro — el proyecto no tiene ninguna
// librería de gráficos instalada (ver package.json), así que no se agrega
// una nueva dependencia solo para esto. "onBarClick" (2026-08-30): clic en
// una barra salta a Reportes con el filtro relacionado (ver goToReportes).
function BarChart({ data, xKey, yKey, formatX = (v) => v, formatY = (v) => v, color = "var(--pf-color-onstreet-primary)", onBarClick }) {
  const values = (data || []).map((d) => Number(d[yKey]) || 0);
  const max = Math.max(1, ...values);
  if (!data || !data.length) return <p className="p-6 text-center text-sm text-slate-500">Sin datos para el período seleccionado.</p>;
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[420px] items-end gap-1.5" style={{ height: 180 }}>
        {data.map((row) => {
          const value = Number(row[yKey]) || 0;
          const heightPct = Math.max(2, Math.round((value / max) * 100));
          return (
            <button
              key={row[xKey]}
              type="button"
              onClick={onBarClick ? () => onBarClick(row) : undefined}
              className={`flex flex-1 flex-col items-center justify-end gap-1 rounded-t-md ${onBarClick ? "cursor-pointer hover:opacity-80" : ""}`}
              title={`${formatX(row[xKey])}: ${formatY(value)}`}
            >
              <span className="text-[10px] font-semibold text-slate-500">{value > 0 ? formatY(value) : ""}</span>
              <div className="w-full rounded-t-md" style={{ height: `${heightPct}%`, backgroundColor: color, minHeight: 2 }} />
              <span className="text-[10px] text-slate-400">{formatX(row[xKey])}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
