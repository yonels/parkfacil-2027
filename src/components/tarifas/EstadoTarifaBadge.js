export default function EstadoTarifaBadge({ estado }) {
  const labels = {
    active: "Activo",
    inactive: "Inactivo",
    draft: "Borrador",
    archived: "Archivado",
  };

  const tones = {
    active: "bg-emerald-100 text-emerald-700",
    inactive: "bg-slate-100 text-slate-700",
    draft: "bg-amber-100 text-amber-700",
    archived: "bg-stone-100 text-stone-700",
  };

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tones[estado] || "bg-slate-100 text-slate-700"}`}>{labels[estado] || estado}</span>;
}
