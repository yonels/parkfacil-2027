import { ArrowUpRight } from "lucide-react";

export default function StatCard({ title, value, description, icon: Icon, trend }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-3 text-3xl font-semibold text-[#041E42]">{value}</p>
          <p className="mt-2 text-sm text-slate-600">{description}</p>
        </div>
        {Icon ? (
          <div className="rounded-2xl bg-[#EEF4FF] p-3 text-[#3150D8]">
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
      </div>
      {trend ? (
        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
          <ArrowUpRight className="h-4 w-4" />
          {trend}
        </div>
      ) : null}
    </div>
  );
}
