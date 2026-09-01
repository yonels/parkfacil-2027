"use client";
// "Empresa" (§16/§19 de la reorganización 2026-08-28): primer nivel de la
// cascada Empresa->Estacionamiento->Área->Calle->Tramo, solo se renderiza
// cuando "companies" trae más de una opción (Root) -- mismo criterio ya
// usado en OnStreetDashboard.js/OnStreetReports.js ("el selector solo
// aparece si el backend devolvió más de una opción"). Cambiar un nivel
// superior limpia los niveles inferiores incompatibles (setFilters completo,
// no un merge parcial), evitando combinaciones jerárquicas imposibles.
//
// Período (§ corrección "filtro de fechas" 2026-08-28): reemplaza el
// antiguo input <input type="date"> de un solo día por OnStreetPeriodFilter
// (HOY/7 DÍAS/MES/AÑO/PERSONALIZADO, mismo componente que usarán Sesiones y
// Pagos) -- se conserva "date" como prop opcional solo por si algún
// llamador viejo aún la pasa, pero deja de ser el campo que se edita aquí.
import OnStreetPeriodFilter from "./OnStreetPeriodFilter";

// statusOptions (§ corrección "filtro de fechas" 2026-08-28): Sesiones y
// Pagos comparten este mismo componente, pero "Estado" significa cosas
// distintas en cada tabla real -- el caller decide qué opciones mostrar;
// por defecto (sin prop) se asume el universo de Sesiones, ya que era el
// único caso soportado antes de esta corrección.
const SESSION_STATUS_OPTIONS = [{ value: "ACTIVE", label: "Vigente" }, { value: "EXPIRED", label: "Vencido" }, { value: "CLOSED", label: "Finalizada" }];

export default function OnStreetFilters({ filters, setFilters, options = {}, companies = [], statusOptions = SESSION_STATUS_OPTIONS }) {
  const select = (key, label, rows) => (
    <label className="text-xs font-semibold text-slate-600">
      {label}
      <select value={filters[key] || ""} onChange={(e) => setFilters({ ...filters, [key]: e.target.value })} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
        <option value="">Todos</option>
        {(rows || []).map((x) => <option key={x.id} value={x.id}>{x.name || x.code}</option>)}
      </select>
    </label>
  );

  return (
    <div className="space-y-3 rounded-2xl bg-white p-4">
      <OnStreetPeriodFilter
        value={filters}
        onChange={(period) => setFilters({ ...filters, date: undefined, ...period })}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {companies.length > 1 ? (
          <label className="text-xs font-semibold text-slate-600">
            Empresa
            <select
              value={filters.companyId || ""}
              onChange={(e) => setFilters({ period: filters.period, from: filters.from, to: filters.to, month: filters.month, year: filters.year, companyId: e.target.value })}
              className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">Todas</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        ) : null}
        {select("parkingId", "Estacionamiento", options.parkings)}
        {select("areaId", "Área", options.areas)}
        {select("streetId", "Calle", options.streets)}
        {select("segmentId", "Tramo", options.segments)}
        <label className="text-xs font-semibold text-slate-600">
          Patente
          <input value={filters.plate || ""} onChange={(e) => setFilters({ ...filters, plate: e.target.value })} placeholder="ABC123" className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm uppercase" />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Estado
          <select value={filters.status || ""} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="">Todos</option>
            {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}
