export default function UsuarioResumen({ title, value, description, tone = "neutral" }) {
  const tones = {
    neutral: "border-slate-200 bg-white text-slate-700",
    positive: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    info: "border-[#DCE8FF] bg-[#F5F9FF] text-[#3150D8]",
  };

  return (
    <div className={`rounded-3xl border p-5 shadow-sm ${tones[tone]}`}>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
      <p className="mt-2 text-sm opacity-80">{description}</p>
    </div>
  );
}
