function segmentsFromData(data) {
  const total = data.reduce((acc, item) => acc + item.value, 0) || 1;
  let acc = 0;

  return data.map((item) => {
    const start = (acc / total) * 100;
    acc += item.value;
    const end = (acc / total) * 100;
    return { ...item, start, end };
  });
}

export default function DonutRevenue({ data = [], centerLabel = "Total", centerValue = "$0" }) {
  const segments = segmentsFromData(data);

  return (
    <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[150px_1fr]">
      <div
        className="relative mx-auto h-[130px] w-[130px] rounded-full"
        style={{
          background: `conic-gradient(${segments.map((segment) => `${segment.color} ${segment.start}% ${segment.end}%`).join(", ")})`,
        }}
      >
        <div className="absolute inset-[16px] flex flex-col items-center justify-center rounded-full bg-white">
          <p className="text-[10px] text-slate-500">{centerLabel}</p>
          <p className="text-sm font-semibold text-[#041E42]">{centerValue}</p>
        </div>
      </div>
      <div className="space-y-2">
        {data.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-2 text-xs">
            <div className="inline-flex items-center gap-2">
              <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-slate-600">{item.label}</span>
            </div>
            <span className="font-semibold text-[#041E42]">{item.valueLabel}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
