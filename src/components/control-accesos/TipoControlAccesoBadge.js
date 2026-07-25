import { getTipoAccesoLabel } from "@/data/controlAccesos.mjs";

export default function TipoControlAccesoBadge({ tipoAcceso }) {
  return <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">{getTipoAccesoLabel(tipoAcceso)}</span>;
}
