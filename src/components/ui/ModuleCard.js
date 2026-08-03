import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function ModuleCard({ title, description, icon: Icon, href, state }) {
  const content = (
    <div className="flex h-full min-h-52 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#3150D8] hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-xl bg-[#EEF4FF] p-2.5 text-[#3150D8]">
          {Icon ? <Icon className="h-5 w-5" /> : null}
        </div>
        {state ? (
          <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            {state}
          </span>
        ) : null}
      </div>
      <h3 className="mt-4 text-base font-semibold text-[#041E42]">{title}</h3>
      <p className="mt-1.5 flex-1 text-sm leading-5 text-slate-600">{description}</p>
      {href ? (
        <div className="mt-4 inline-flex items-center gap-2 self-start text-sm font-medium text-[#3150D8]">
          Abrir <ArrowRight className="h-4 w-4" />
        </div>
      ) : null}
    </div>
  );

  if (!href) {
    return content;
  }

  return <Link href={href} className="block h-full">{content}</Link>;
}
