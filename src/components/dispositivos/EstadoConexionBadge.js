export default function EstadoConexionBadge({ conexion }) {
  const variants = {
    online: "border-emerald-200 bg-emerald-50 text-emerald-700",
    offline: "border-rose-200 bg-rose-50 text-rose-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    unknown: "border-slate-200 bg-slate-100 text-slate-700",
  };

  const labels = {
    online: "En línea",
    offline: "Desconectado",
    warning: "Advertencia",
    unknown: "Desconocido",
  };

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${variants[conexion] ?? variants.unknown}`}>
      {labels[conexion] ?? conexion}
    </span>
  );
}
