const severityClass = {
  danger: "border-[#DC2626]/25 bg-[#DC2626]/5 text-[#DC2626]",
  warning: "border-[#F59E0B]/25 bg-[#F59E0B]/10 text-[#B45309]",
  info: "border-[#1E5EFF]/25 bg-[#1E5EFF]/10 text-[#1E5EFF]",
};

export default function AlertList({ items = [] }) {
  return (
    <div className="space-y-2">
      {items.map((alert) => (
        <article key={alert.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5">
          <div className="min-w-0">
            <div className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${severityClass[alert.severity] || severityClass.info}`}>
              {alert.severityLabel}
            </div>
            <p className="mt-1 truncate text-xs font-semibold text-[#041E42]">{alert.title}</p>
            <p className="mt-0.5 text-xs text-slate-500">{alert.detail}</p>
          </div>
          <p className="shrink-0 text-[11px] text-slate-500">{alert.time}</p>
        </article>
      ))}
    </div>
  );
}
