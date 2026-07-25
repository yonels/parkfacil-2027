export default function StatusCard({ title, value, subtitle, icon: Icon, trendColor = "#1E5EFF", points = [] }) {
  const maxPoint = Math.max(...points, 1);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-start gap-3">
        {Icon ? (
          <div className="rounded-xl p-2" style={{ backgroundColor: `${trendColor}14`, color: trendColor }}>
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
        <div>
          <p className="text-xs font-medium text-slate-500">{title}</p>
          <p className="mt-1 text-2xl font-semibold text-[#041E42]">{value}</p>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
      <div className="mt-2.5 flex h-7 items-end gap-1">
        {points.map((point, index) => (
          <span
            key={`${title}-${index}`}
            className="block w-2 rounded-t"
            style={{
              height: `${Math.max(10, (point / maxPoint) * 100)}%`,
              backgroundColor: trendColor,
              opacity: 0.22 + (index / points.length) * 0.7,
            }}
          />
        ))}
      </div>
    </article>
  );
}
