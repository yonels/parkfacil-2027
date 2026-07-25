export default function PermanenciaBadge({ permanencia }) {
  if (!permanencia || permanencia <= 0) {
    return <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">Sin permanencia</span>;
  }

  return <span className="inline-flex rounded-full bg-[#EEF4FF] px-3 py-1 text-xs font-semibold text-[#3150D8]">{permanencia} min</span>;
}
