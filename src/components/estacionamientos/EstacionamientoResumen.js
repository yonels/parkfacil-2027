export default function EstacionamientoResumen({ title, value, description, tone = "neutral", onClick }) {
  const tones = {
    neutral: "border-slate-200 bg-white text-slate-700",
    positive: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    info: "border-[#DCE8FF] bg-[#F5F9FF] text-[#3150D8]",
  };

  return (
    <button type="button" onClick={onClick} className={`w-full rounded-3xl border p-5 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3150D8] focus-visible:ring-offset-2 ${tones[tone]}`}>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
      <p className="mt-2 text-sm opacity-80">{description}</p>
    </button>
  );
}
