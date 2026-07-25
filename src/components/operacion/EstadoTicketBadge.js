export default function EstadoTicketBadge({ estado }) {
  const labels = {
    open: "Abierto",
    closed: "Cerrado",
    cancelled: "Cancelado",
    pending_review: "Pendiente de revisión",
    lost: "Extraviado",
    exempt: "Exento",
  };

  const tones = {
    open: "bg-emerald-100 text-emerald-700",
    closed: "bg-slate-100 text-slate-700",
    cancelled: "bg-rose-100 text-rose-700",
    pending_review: "bg-amber-100 text-amber-700",
    lost: "bg-orange-100 text-orange-700",
    exempt: "bg-violet-100 text-violet-700",
  };

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tones[estado] || "bg-slate-100 text-slate-700"}`}>{labels[estado] || estado}</span>;
}
