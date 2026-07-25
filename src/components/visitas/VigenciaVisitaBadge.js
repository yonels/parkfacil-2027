export default function VigenciaVisitaBadge({ vigencia }) {
  const tones = {
    Vigente: "bg-emerald-100 text-emerald-700",
    "Proxima a vencer": "bg-amber-100 text-amber-700",
    Futura: "bg-[#EEF4FF] text-[#3150D8]",
    Vencida: "bg-orange-100 text-orange-700",
    Finalizada: "bg-slate-100 text-slate-700",
    "No vigente": "bg-rose-100 text-rose-700",
    "No disponible": "bg-slate-100 text-slate-700",
  };

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tones[vigencia] || "bg-slate-100 text-slate-700"}`}>{vigencia}</span>;
}
