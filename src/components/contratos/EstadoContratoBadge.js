export default function EstadoContratoBadge({ estado }) {
  const labels = {
    draft: "Borrador",
    under_review: "En revisión",
    pending_signature: "Pendiente de firma",
    signed: "Firmado",
    active: "Vigente",
    suspended: "Suspendido",
    expired: "Vencido",
    terminated: "Terminado",
    cancelled: "Cancelado",
  };

  const tones = {
    draft: "bg-slate-100 text-slate-700",
    under_review: "bg-amber-100 text-amber-700",
    pending_signature: "bg-orange-100 text-orange-700",
    signed: "bg-blue-100 text-blue-700",
    active: "bg-emerald-100 text-emerald-700",
    suspended: "bg-violet-100 text-violet-700",
    expired: "bg-rose-100 text-rose-700",
    terminated: "bg-stone-100 text-stone-700",
    cancelled: "bg-gray-100 text-gray-700",
  };

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tones[estado] || "bg-slate-100 text-slate-700"}`}>{labels[estado] || estado}</span>;
}
