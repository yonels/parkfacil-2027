import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

export default function StatCard({ title, value, description, icon: Icon, trend, href }) {
  const content = (
    <div className={`h-full rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition ${href ? "cursor-pointer hover:-translate-y-1 hover:border-[#3150D8] hover:shadow-md" : ""}`}>
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

  return href ? (
    <Link href={href} className="block h-full rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3150D8] focus-visible:ring-offset-2" aria-label={`Ver información de ${title}`}>
      {content}
    </Link>
  ) : content;
}
