export default function OperacionResumen({ title, value, description, tone = "neutral", onClick, selected = false }) {
  const tones = {
    info: "bg-[#EEF4FF] text-[#3150D8]",
    positive: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    neutral: "bg-slate-100 text-slate-700",
  };

  return (
    <button type="button" onClick={onClick} className={`w-full rounded-3xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#3150D8] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3150D8] ${selected ? "border-[#3150D8] ring-2 ring-[#3150D8]/15" : "border-slate-200"}`}>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-3 text-3xl font-semibold text-[#041E42]">{value}</p>
      <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-medium ${tones[tone] || tones.neutral}`}>{description}</p>
    </button>
  );
}
