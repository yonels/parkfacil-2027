export default function VigenciaAbonadoBadge({ texto }) {
  const tones = {
    Vigente: "bg-emerald-100 text-emerald-700",
    "Próximo a vencer": "bg-amber-100 text-amber-700",
    Vencido: "bg-rose-100 text-rose-700",
  };

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tones[texto] || "bg-slate-100 text-slate-700"}`}>{texto}</span>;
}
