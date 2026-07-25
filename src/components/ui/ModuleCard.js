import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function ModuleCard({ title, description, icon: Icon, href, state }) {
  const content = (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-[#3150D8] hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-2xl bg-[#EEF4FF] p-3 text-[#3150D8]">
          {Icon ? <Icon className="h-6 w-6" /> : null}
        </div>
        {state ? (
          <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            {state}
          </span>
        ) : null}
      </div>
      <h3 className="mt-5 text-lg font-semibold text-[#041E42]">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      {href ? (
        <div className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-[#3150D8]">
          Abrir <ArrowRight className="h-4 w-4" />
        </div>
      ) : null}
    </div>
  );

  if (!href) {
    return content;
  }

  return <Link href={href}>{content}</Link>;
}
