import { buildCapacityVisualization } from "@/lib/parkingOperations.mjs";

export default function CapacityVisualization({ capacity, occupied }) {
  const data = buildCapacityVisualization(capacity, occupied);
  return <div className="mt-3">
    <div className="flex flex-wrap gap-3 text-xs font-medium text-slate-600"><span>Capacidad {data.capacity}</span><span className="text-rose-700">Ocupadas {data.occupied}</span><span className="text-emerald-700">Disponibles {data.available}</span></div>
    {data.mode === "units"
      ? <div aria-label={`${data.occupied} ocupadas y ${data.available} disponibles`} className="mt-2 flex flex-wrap gap-1">{data.indicators.map((item, index) => <span key={index} title={item.state === "occupied" ? "Ocupada" : "Disponible"} className={`h-3 w-3 rounded-sm ${item.state === "occupied" ? "bg-rose-500" : "bg-emerald-500"}`} />)}</div>
      : <div className="mt-2 h-3 overflow-hidden rounded-full bg-emerald-500"><div aria-label={`${data.occupied} unidades ocupadas`} className="h-full bg-rose-500" style={{ width: `${data.capacity ? data.occupied / data.capacity * 100 : 0}%` }} /></div>}
    <p className="mt-2 text-xs text-slate-500">Representación de capacidad. Los indicadores no corresponden a la ubicación física exacta de cada vehículo.</p>
  </div>;
}
