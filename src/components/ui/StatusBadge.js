export default function StatusBadge({ variant = "neutral", children }) {
  const variants = {
    neutral: "border-slate-200 bg-slate-100 text-slate-700",
    positive: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    error: "border-rose-200 bg-rose-50 text-rose-700",
  };

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${variants[variant]}`}>
      {children}
    </span>
  );
}
