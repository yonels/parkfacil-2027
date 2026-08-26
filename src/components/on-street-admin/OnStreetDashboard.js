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
  const [sortBy, setSortBy] = useState("sessions");

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ period, sortBy });
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
  }, [period, customFrom, customTo, companyId, parkingId, areaId, streetId, segmentId, sortBy]);

  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  const options = data?.options || {};
  const areas = useMemo(() => (options.areas || []).filter((a) => !parkingId || a.parkingId === parkingId), [options.areas, parkingId]);
  const streets = useMemo(() => (options.streets || []).filter((s) => !areaId || s.sectorId === areaId), [options.streets, areaId]);
  const segments = useMemo(() => (options.segments || []).filter((s) => !streetId || s.streetId === streetId), [options.segments, streetId]);

  const activeSessionsColumns = useMemo(() => [
    { key: "operational_number", label: "Sesión" },
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
          <KpiGrid
            items={[
              ["Sesiones activas ahora", data.kpis.activeSessionsNow],
              ["Sesiones del período", data.kpis.sessionsInPeriod],
              ["Recaudación", money(data.kpis.revenue)],
              ["Minutos contratados", data.kpis.minutesPurchased],
              ["Extensiones", data.kpis.extensionsCount],
              ["Ticket promedio", money(data.kpis.averageTicket)],
            ]}
          />
          <KpiGrid
            items={[
              ["Tiempo promedio contratado", `${data.kpis.averageMinutesPerSession} min`],
              ["Recaudación por sesión", money(data.kpis.revenuePerSession)],
              ["Pagos aprobados", data.kpis.paymentsApproved],
              ["Pagos Rechazados", data.kpis.paymentsRejected],
              ["Tasa de aprobación Webpay", pct(data.kpis.approvalRate)],
            ]}
          />

          <div className="grid gap-6 xl:grid-cols-2">
            <ChartCard title="Sesiones por día">
              <BarChart data={data.sessionsByDay} xKey="day" yKey="count" formatX={dayLabel} color="var(--pf-color-onstreet-primary)" />
            </ChartCard>
            <ChartCard title="Recaudación On Street">
              <BarChart data={data.revenueByDay} xKey="day" yKey="amount" formatX={dayLabel} formatY={money} color="#059669" />
            </ChartCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <ChartCard title="Minutos contratados" subtitle="Distribución analítica — la contratación sigue permitiendo de 1 a 1.440 minutos.">
              <BarChart data={data.minutesDistribution} xKey="label" yKey="count" color="#7C3AED" />
            </ChartCard>
            <ChartCard title="Extensiones de estadía">
              <div className="grid grid-cols-3 gap-3 text-center">
                <MiniStat label="Sin extensión" value={data.extensions.none} />
                <MiniStat label="Una extensión" value={data.extensions.one} />
                <MiniStat label="Múltiples" value={data.extensions.many} />
              </div>
              <p className="mt-4 text-center text-sm text-slate-600">
                <span className="text-2xl font-black text-[var(--pf-color-onstreet-primary)]">{pct(data.extensions.extensionsRate)}</span> de sesiones extendidas
              </p>
            </ChartCard>
          </div>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-[#041E42]">Puntos QR con mayor utilización</h2>
              <label className="text-xs font-semibold text-slate-600">
                Ordenar por
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="ml-2 rounded-xl border border-slate-200 px-2 py-1 text-sm">
                  <option value="sessions">Sesiones</option>
                  <option value="revenue">Recaudación</option>
                  <option value="minutes">Minutos</option>
                </select>
              </label>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500"><tr>{["Ubicación", "Estacionamiento", "Calle", "Tramo", "Sesiones", "Minutos", "Recaudación", "Extensiones"].map((h) => <th key={h} className="border-b border-slate-200 px-3 py-2">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.locationRanking.slice(0, 15).map((row) => (
                    <tr key={row.key}>
                      <td className="px-3 py-2 font-semibold text-[var(--pf-color-onstreet-primary)]">{row.label}</td>
                      <td className="px-3 py-2">{row.parkingName}</td>
                      <td className="px-3 py-2">{row.streetName}</td>
                      <td className="px-3 py-2">{row.segmentName}</td>
                      <td className="px-3 py-2 tabular-nums">{row.sessions}</td>
                      <td className="px-3 py-2 tabular-nums">{row.minutes}</td>
                      <td className="px-3 py-2 tabular-nums">{money(row.revenue)}</td>
                      <td className="px-3 py-2 tabular-nums">{row.extensions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.locationRanking.length ? <p className="p-8 text-center text-sm text-slate-500">Sin datos para el período y filtros seleccionados.</p> : null}
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <ChartCard title="Estados de sesión">
              <div className="grid grid-cols-3 gap-3 text-center">
                {Object.entries(STATUS_LABELS).map(([key, label]) => <MiniStat key={key} label={label} value={data.statusDistribution[key] || 0} />)}
              </div>
            </ChartCard>
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-[#041E42]">Webpay</h2>
                <button type="button" onClick={() => router.push("/on-street-qr/pagos")} className="text-sm font-semibold text-[var(--pf-color-onstreet-primary)] hover:underline">Ver pagos →</button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                <MiniStat label="Aprobados" value={data.kpis.paymentsApproved} />
                <MiniStat label="Pagos Rechazados" value={data.kpis.paymentsRejected} />
              </div>
            </section>
          </div>

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

          <section className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5">
            <div className="flex items-center gap-3 text-slate-500">
              <MessageSquareOff className="h-5 w-5" />
              <div>
                <h2 className="text-sm font-bold text-slate-700">SMS de vencimiento</h2>
                <p className="mt-1 text-sm">Disponible al activar recordatorios SMS.</p>
              </div>
            </div>
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

function KpiGrid({ items }) {
  const xlClass = XL_COLUMNS[items.length] || "xl:grid-cols-6";
  return (
    <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${xlClass}`}>
      {items.map(([label, value]) => (
        <article key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-black tabular-nums text-[#041E42]">{value}</p>
        </article>
      ))}
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-2xl font-black tabular-nums text-[#041E42]">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </div>
  );
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
// una nueva dependencia solo para esto.
function BarChart({ data, xKey, yKey, formatX = (v) => v, formatY = (v) => v, color = "var(--pf-color-onstreet-primary)" }) {
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
            <div key={row[xKey]} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${formatX(row[xKey])}: ${formatY(value)}`}>
              <span className="text-[10px] font-semibold text-slate-500">{value > 0 ? formatY(value) : ""}</span>
              <div className="w-full rounded-t-md" style={{ height: `${heightPct}%`, backgroundColor: color, minHeight: 2 }} />
              <span className="text-[10px] text-slate-400">{formatX(row[xKey])}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
