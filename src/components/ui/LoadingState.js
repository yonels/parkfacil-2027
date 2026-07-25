export default function LoadingState({ label = "Cargando contenido" }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm" role="status" aria-live="polite">
      <span className="h-3.5 w-3.5 animate-pulse rounded-full bg-[#3150D8]" />
      <span>{label}</span>
    </div>
  );
}
