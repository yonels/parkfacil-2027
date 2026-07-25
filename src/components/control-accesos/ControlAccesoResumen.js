export default function ControlAccesoResumen({ title, value, description, tone = "neutral" }) {
  const tones = {
    info: "bg-[#EEF4FF] text-[#3150D8]",
    positive: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    neutral: "bg-slate-100 text-slate-700",
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-3 text-3xl font-semibold text-[#041E42]">{value}</p>
      <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-medium ${tones[tone] || tones.neutral}`}>{description}</p>
    </div>
  );
}
