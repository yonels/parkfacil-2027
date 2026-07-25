const statusColor = {
  online: "#16A34A",
  warning: "#F59E0B",
  offline: "#DC2626",
};

export default function SystemStatusBar({ items = [] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2 rounded-xl bg-[#F7F9FC] px-3 py-2">
            <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusColor[item.state] || "#64748B" }} />
            <div>
              <p className="text-[11px] text-slate-500">{item.label}</p>
              <p className="text-xs font-semibold text-[#041E42]">{item.value}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
