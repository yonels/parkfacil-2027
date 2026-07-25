function donutSegments(data) {
  const total = data.reduce((acc, item) => acc + item.value, 0) || 1;
  let acc = 0;

  return data.map((item) => {
    const start = (acc / total) * 100;
    acc += item.value;
    const end = (acc / total) * 100;
    return {
      ...item,
      start,
      end,
    };
  });
}

export default function DeviceStatus({ data = [] }) {
  const total = data.reduce((acc, item) => acc + item.value, 0);
  const segments = donutSegments(data);

  return (
    <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[140px_1fr]">
      <div className="relative mx-auto h-[120px] w-[120px] rounded-full" style={{
        background: `conic-gradient(${segments
          .map((segment) => `${segment.color} ${segment.start}% ${segment.end}%`)
          .join(", ")})`,
      }}>
        <div className="absolute inset-[14px] flex flex-col items-center justify-center rounded-full bg-white">
          <p className="text-2xl font-semibold text-[#041E42]">{total}</p>
          <p className="text-[11px] text-slate-500">Total</p>
        </div>
      </div>
      <div className="space-y-2">
        {data.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-2 text-xs">
            <div className="inline-flex items-center gap-2 text-slate-600">
              <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              <span>{item.label}</span>
            </div>
            <span className="font-semibold text-[#041E42]">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
