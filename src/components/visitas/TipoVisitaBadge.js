import { getTipoVisitaLabel } from "@/data/visitas.mjs";

export default function TipoVisitaBadge({ tipoVisita }) {
  return <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">{getTipoVisitaLabel(tipoVisita)}</span>;
}
