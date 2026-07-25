import { getEstadoVisitaLabel } from "@/data/visitas.mjs";

export default function EstadoVisitaBadge({ estado }) {
  const tones = {
    scheduled: "bg-blue-100 text-blue-700",
    pending_approval: "bg-amber-100 text-amber-700",
    approved: "bg-indigo-100 text-indigo-700",
    checked_in: "bg-cyan-100 text-cyan-700",
    in_progress: "bg-emerald-100 text-emerald-700",
    checked_out: "bg-teal-100 text-teal-700",
    completed: "bg-slate-100 text-slate-700",
    cancelled: "bg-rose-100 text-rose-700",
    rejected: "bg-red-100 text-red-700",
    expired: "bg-orange-100 text-orange-700",
    no_show: "bg-violet-100 text-violet-700",
  };

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tones[estado] || "bg-slate-100 text-slate-700"}`}>{getEstadoVisitaLabel(estado)}</span>;
}
