export default function EstadoEmpresaBadge({ estado }) {
  const variants = {
    active: "border-emerald-200 bg-emerald-50 text-emerald-700",
    inactive: "border-rose-200 bg-rose-50 text-rose-700",
    onboarding: "border-amber-200 bg-amber-50 text-amber-700",
  };

  const labels = {
    active: "Activa",
    inactive: "Inactiva",
    onboarding: "En implementación",
  };

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${variants[estado] ?? variants.onboarding}`}>
      {labels[estado] ?? estado}
    </span>
  );
}
