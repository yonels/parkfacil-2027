"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigationItems } from "@/config/navigation";

export default function MobileNavigation({ onNavigate }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm lg:hidden" aria-label="Navegación móvil">
      {navigationItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;

        if (!item.href) {
          return (
            <div key={item.label} className="flex min-w-[120px] flex-col items-start gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Próximamente</span>
            </div>
          );
        }

        return (
          <Link key={item.label} href={item.href} onClick={onNavigate} className={`flex min-w-[120px] flex-col items-start gap-2 rounded-2xl px-3 py-3 text-sm transition ${isActive ? "bg-[#EEF4FF] text-[#3150D8]" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
