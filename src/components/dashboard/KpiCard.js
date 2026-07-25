import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

const trendStyles = {
  up: "text-[#16A34A]",
  down: "text-[#DC2626]",
  neutral: "text-[#64748B]",
};

function TrendIcon({ trend }) {
  if (trend === "up") {
    return <ArrowUpRight className="h-3.5 w-3.5" />;
  }
  if (trend === "down") {
    return <ArrowDownRight className="h-3.5 w-3.5" />;
  }
  return <Minus className="h-3.5 w-3.5" />;
}

export default function KpiCard({ title, value, secondary, comparison, trend = "neutral", icon: Icon, accent = "#3150D8" }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500">{title}</p>
          <p className="mt-1.5 text-[30px] font-semibold leading-none text-[#041E42]">{value}</p>
          {secondary ? <p className="mt-1 text-xs text-slate-500">{secondary}</p> : null}
        </div>
        {Icon ? (
          <div className="rounded-full p-2.5" style={{ backgroundColor: `${accent}1A`, color: accent }}>
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
      </div>
      <div className={`mt-3 inline-flex items-center gap-1 text-xs font-semibold ${trendStyles[trend] || trendStyles.neutral}`}>
        <TrendIcon trend={trend} />
        <span>{comparison}</span>
      </div>
    </article>
  );
}
