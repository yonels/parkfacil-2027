export default function EstadoAbonadoBadge({ estado }) {
  const labels = {
    active: "Activo",
    inactive: "Inactivo",
    suspended: "Suspendido",
    pending: "Pendiente",
    expired: "Vencido",
    cancelled: "Cancelado",
    blocked: "Bloqueado",
  };

  const tones = {
    active: "bg-emerald-100 text-emerald-700",
    inactive: "bg-slate-100 text-slate-700",
    suspended: "bg-amber-100 text-amber-700",
    pending: "bg-sky-100 text-sky-700",
    expired: "bg-rose-100 text-rose-700",
    cancelled: "bg-orange-100 text-orange-700",
    blocked: "bg-rose-100 text-rose-700",
  };

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tones[estado] || "bg-slate-100 text-slate-700"}`}>{labels[estado] || estado}</span>;
}
