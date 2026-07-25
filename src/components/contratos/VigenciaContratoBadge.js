export default function VigenciaContratoBadge({ vigencia }) {
  if (vigencia?.isVencido) {
    return <span className="inline-flex rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">Vencido</span>;
  }

  if (vigencia?.isProximoAVencer) {
    return <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">Próximo a vencer</span>;
  }

  if (vigencia?.isVigente) {
    return <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Vigente</span>;
  }

  return <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">No vigente</span>;
}
