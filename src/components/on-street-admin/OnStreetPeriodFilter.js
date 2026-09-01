"use client";
// Selector de período On Street reutilizable (§ corrección "filtro de
// fechas" 2026-08-28): HOY/7 DÍAS/MES/AÑO/PERSONALIZADO, mismo patrón
// visual que ya usan Dashboard/Fiscalizaciones/Reportes (PERIODS + botones)
// -- aquí se extrae a un componente propio porque, a diferencia de esas
// pantallas (mes/año siempre "el actual"), Sesiones y Pagos necesitan poder
// elegir un MES o AÑO arbitrario (p. ej. "Agosto 2026"), no solo el
// corriente. Resuelve los límites reales con resolvePeriodBounds
// (onStreetDashboardCore.mjs) del lado servidor -- este componente solo
// arma {period, from, to, month, year}, nunca calcula fechas él mismo.
// "Día específico" (pedido explícitamente) se cubre con PERSONALIZADO
// (Desde = Hasta), sin agregar un sexto botón que rompería la paridad
// visual con el Dashboard.
const PERIODS = [
  { key: "today", label: "Hoy" },
  { key: "7d", label: "7 días" },
  { key: "month", label: "Mes" },
  { key: "year", label: "Año" },
  { key: "custom", label: "Personalizado" },
];

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function todayIso() { return new Date().toISOString().slice(0, 10); }

export default function OnStreetPeriodFilter({ value, onChange }) {
  const period = value?.period || "today";
  const now = new Date();

  function selectPeriod(key) {
    if (key === "month") { onChange({ period: "month", month: value?.month || now.getMonth() + 1, year: value?.year || now.getFullYear() }); return; }
    if (key === "year") { onChange({ period: "year", year: value?.year || now.getFullYear() }); return; }
    if (key === "custom") { onChange({ period: "custom", from: value?.from || todayIso(), to: value?.to || todayIso() }); return; }
    onChange({ period: key });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <button key={p.key} type="button" onClick={() => selectPeriod(p.key)} className={`min-h-9 rounded-full px-4 py-2 text-xs font-semibold transition ${period === p.key ? "bg-[var(--pf-color-onstreet-primary)] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            {p.label}
          </button>
        ))}
      </div>

      {period === "month" ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-slate-600">
            Mes
            <select value={value?.month || now.getMonth() + 1} onChange={(e) => onChange({ period: "month", month: Number(e.target.value), year: value?.year || now.getFullYear() })} className="mt-1 block min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
              {MESES.map((nombre, i) => <option key={nombre} value={i + 1}>{nombre}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Año
            <input type="number" inputMode="numeric" min="2000" max="2100" value={value?.year || now.getFullYear()} onChange={(e) => onChange({ period: "month", month: value?.month || now.getMonth() + 1, year: Number(e.target.value) })} className="mt-1 block min-h-10 w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </label>
        </div>
      ) : null}

      {period === "year" ? (
        <label className="block max-w-[8rem] text-xs font-semibold text-slate-600">
          Año
          <input type="number" inputMode="numeric" min="2000" max="2100" value={value?.year || now.getFullYear()} onChange={(e) => onChange({ period: "year", year: Number(e.target.value) })} className="mt-1 block min-h-10 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </label>
      ) : null}

      {period === "custom" ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-slate-600">
            Desde
            <input type="date" value={value?.from || todayIso()} onChange={(e) => onChange({ period: "custom", from: e.target.value, to: value?.to || e.target.value })} className="mt-1 block min-h-10 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Hasta
            <input type="date" value={value?.to || todayIso()} onChange={(e) => onChange({ period: "custom", from: value?.from || e.target.value, to: e.target.value })} className="mt-1 block min-h-10 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </label>
        </div>
      ) : null}
    </div>
  );
}
