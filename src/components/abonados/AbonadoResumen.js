export default function AbonadoResumen({ title, value, description, tone = "neutral", icon: Icon, onClick, active = false }) {
  const tones = {
    info: "bg-[#EEF4FF] text-[#3150D8]",
    positive: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    neutral: "bg-slate-100 text-slate-700",
  };

  const baseClasses = `rounded-3xl border bg-white p-5 shadow-sm transition ${
    active
          ? "border-[#3150D8] ring-2 ring-[#3150D8]/20"
      : "border-slate-200"
        } ${onClick ? "cursor-pointer hover:-translate-y-0.5 hover:border-[#3150D8] hover:shadow-md" : ""}`;

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        {Icon ? (
          <span className="rounded-2xl bg-[#F4F7FB] p-2 text-[#3150D8]">
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-3xl font-semibold text-[#041E42]">{value}</p>
      <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-medium ${tones[tone] || tones.neutral}`}>{description}</p>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${baseClasses} text-left`}>
        {content}
      </button>
    );
  }

  return (
    <div className={baseClasses}>
      {content}
    </div>
  );
}
