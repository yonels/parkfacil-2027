export default function LineChartMini({ points = [], stroke = "#1E5EFF", area = "rgba(30,94,255,0.15)", maxY = 100 }) {
  if (!points.length) {
    return <div className="h-40 rounded-xl bg-slate-50" />;
  }

  const width = 560;
  const height = 180;
  const step = width / (points.length - 1);

  const coords = points.map((point, index) => {
    const x = Math.round(index * step);
    const y = Math.round(height - (point / maxY) * (height - 8) - 4);
    return [x, y];
  });

  const linePath = coords.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full" role="img" aria-label="Grafico de linea demostrativo">
      <path d={areaPath} fill={area} />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
