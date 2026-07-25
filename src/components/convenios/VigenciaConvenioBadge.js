export default function VigenciaConvenioBadge({ vigencia }) {
  const tones = {
    Vigente: "bg-emerald-100 text-emerald-700",
    "Proximo a vencer": "bg-amber-100 text-amber-700",
    Futuro: "bg-[#EEF4FF] text-[#3150D8]",
    Vencido: "bg-orange-100 text-orange-700",
    "No vigente": "bg-slate-100 text-slate-700",
  };

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tones[vigencia] || "bg-slate-100 text-slate-700"}`}>{vigencia}</span>;
}
