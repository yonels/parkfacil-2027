import { getModoOperacionLabel } from "@/data/controlAccesos.mjs";

export default function ModoControlAccesoBadge({ modoOperacion }) {
  const tones = {
    automatic: "bg-[#EEF4FF] text-[#3150D8]",
    manual: "bg-orange-100 text-orange-700",
    mixed: "bg-violet-100 text-violet-700",
    disabled: "bg-slate-200 text-slate-700",
  };

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tones[modoOperacion] || "bg-slate-100 text-slate-700"}`}>{getModoOperacionLabel(modoOperacion)}</span>;
}
