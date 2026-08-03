import { getSectorMetrics } from "@/lib/estacionamientos.mjs";

export default function SectorCapacity({ sector }) {
  const metrics = getSectorMetrics(sector);
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
    <div className="grid grid-cols-4 gap-2 text-center text-xs"><Metric label="Capacidad" value={metrics.capacity} /><Metric label="Ocupadas" value={metrics.occupied} tone="text-rose-700" /><Metric label="Disponibles" value={metrics.available} tone="text-emerald-700" /><Metric label="Ocupación" value={`${metrics.occupancyPercentage}%`} /></div>
    {metrics.visualizationMode === "units" ? <div className="mt-4 flex flex-wrap gap-1" aria-label={`${metrics.occupied} unidades ocupadas y ${metrics.available} disponibles`}>
      {Array.from({ length: metrics.capacity }, (_, index) => <span key={index} title={index < metrics.occupied ? "Ocupada" : "Disponible"} className={`h-3 w-3 rounded-sm ${index < metrics.occupied ? "bg-rose-400" : "bg-emerald-400"}`} />)}
    </div> : <div className="mt-4 overflow-hidden rounded-full bg-emerald-300" aria-label={`${metrics.occupancyPercentage}% de ocupación`}><div className="h-3 bg-rose-400" style={{ width: `${metrics.occupancyPercentage}%` }} /></div>}
    <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600"><span>■ <span className="text-rose-700">Ocupadas</span></span><span>■ <span className="text-emerald-700">Disponibles</span></span><span>{metrics.visualizationMode === "summary" ? "Vista proporcional resumida." : "Un indicador por unidad."}</span></div>
    <p className="mt-2 text-xs leading-5 text-slate-500">Representación de capacidad. Los indicadores no corresponden a la ubicación física exacta de cada vehículo.</p>
  </div>;
}

function Metric({ label, value, tone = "text-[#041E42]" }) {
  return <div><p className="text-slate-500">{label}</p><p className={`mt-1 font-semibold tabular-nums ${tone}`}>{value}</p></div>;
}
