import { getTipoConvenioLabel } from "@/data/convenios.mjs";

export default function TipoConvenioBadge({ tipo }) {
  return <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">{getTipoConvenioLabel(tipo)}</span>;
}
