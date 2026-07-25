import { getEstadoAprobacionLabel } from "@/data/visitas.mjs";

export default function AprobacionVisitaBadge({ estadoAprobacion }) {
  const tones = {
    not_required: "bg-slate-100 text-slate-700",
    pending: "bg-amber-100 text-amber-700",
    approved: "bg-emerald-100 text-emerald-700",
    rejected: "bg-rose-100 text-rose-700",
    revoked: "bg-red-100 text-red-700",
  };

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tones[estadoAprobacion] || "bg-slate-100 text-slate-700"}`}>{getEstadoAprobacionLabel(estadoAprobacion)}</span>;
}
