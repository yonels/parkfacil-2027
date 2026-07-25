import { getEstadoControlAccesoLabel } from "@/data/controlAccesos.mjs";

export default function EstadoControlAccesoBadge({ estado }) {
  const tones = {
    active: "bg-emerald-100 text-emerald-700",
    inactive: "bg-slate-100 text-slate-700",
    maintenance: "bg-amber-100 text-amber-700",
    blocked: "bg-rose-100 text-rose-700",
  };

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tones[estado] || "bg-slate-100 text-slate-700"}`}>{getEstadoControlAccesoLabel(estado)}</span>;
}
