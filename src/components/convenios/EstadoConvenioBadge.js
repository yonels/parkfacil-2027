import { getEstadoConvenioLabel } from "@/data/convenios.mjs";

export default function EstadoConvenioBadge({ estado }) {
  const tones = {
    draft: "bg-slate-100 text-slate-700",
    scheduled: "bg-indigo-100 text-indigo-700",
    active: "bg-emerald-100 text-emerald-700",
    suspended: "bg-amber-100 text-amber-700",
    expired: "bg-orange-100 text-orange-700",
    cancelled: "bg-rose-100 text-rose-700",
    archived: "bg-zinc-100 text-zinc-700",
  };

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tones[estado] || "bg-slate-100 text-slate-700"}`}>{getEstadoConvenioLabel(estado)}</span>;
}
