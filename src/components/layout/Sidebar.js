"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { navigationSections } from "@/config/navigation";

function isActivePath(pathname, href) {
  if (!href) {
    return false;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarContent({ collapsed, pathname, onNavigate, onMenuAction }) {
  const linkClasses = (active, disabled) => {
    if (disabled) {
      return "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400";
    }

    return `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? "bg-[#3150D8] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)]" : "text-[#B8C4E3] hover:bg-[#0B3D91] hover:text-white"}`;
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#3150D8] text-sm font-semibold text-white">P</div>
          {!collapsed ? (
            <div>
              <p className="text-sm font-semibold text-white">ParkFacil</p>
              <p className="text-xs text-[#9FB1DF]">Administración</p>
            </div>
          ) : null}
        </div>
      </div>

      <nav className="mt-6 flex-1 space-y-5 overflow-y-auto pr-1">
        {navigationSections.map((section) => (
          <div key={section.group}>
            {!collapsed ? (
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8EA2D5]">{section.group}</p>
            ) : null}
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActivePath(pathname, item.href);

                if (item.href) {
                  return (
                    <Link key={item.label} href={item.href} onClick={onNavigate} className={linkClasses(active, false)}>
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed ? <span className="truncate">{item.label}</span> : null}
                    </Link>
                  );
                }

                return (
                  <div key={item.label} className={linkClasses(false, true)}>
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed ? <span className="truncate">{item.label}</span> : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-4 border-t border-[#1E3D72] pt-4">
        <button
          type="button"
          onClick={onMenuAction}
          className="flex w-full items-center justify-center rounded-xl border border-[#2A4C87] bg-[#0B3D91] px-3 py-2.5 text-sm font-medium text-white transition hover:bg-[#1E5EFF]"
        >
          {collapsed ? "Mostrar menú" : "Ocultar menú"}
        </button>
      </div>
    </div>
  );
}

export default function Sidebar({ collapsed, onToggle, mobileOpen, onCloseMobile }) {
  const pathname = usePathname();

  return (
    <>
      <aside className={`hidden h-screen shrink-0 border-r border-[#15376F] bg-[#041E42] px-3 py-4 lg:block ${collapsed ? "w-24" : "w-72"}`}>
        <div className="flex h-full flex-col">
          <div className="mb-4 flex items-center justify-end">
            <button
              type="button"
              aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
              onClick={onToggle}
              className="rounded-lg p-2 text-[#A3B5DF] transition hover:bg-[#0B3D91] hover:text-white"
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>
          <SidebarContent collapsed={collapsed} pathname={pathname} onNavigate={() => {}} onMenuAction={onToggle} />
        </div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 bg-slate-950/55 lg:hidden" onClick={onCloseMobile}>
          <aside className="h-full w-[292px] max-w-[84%] border-r border-[#15376F] bg-[#041E42] px-3 py-4" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex justify-end">
              <button type="button" onClick={onCloseMobile} className="rounded-lg p-2 text-[#A3B5DF] transition hover:bg-[#0B3D91] hover:text-white" aria-label="Cerrar menú">
                <X className="h-4 w-4" />
              </button>
            </div>
            <SidebarContent collapsed={false} pathname={pathname} onNavigate={onCloseMobile} onMenuAction={onCloseMobile} />
          </aside>
        </div>
      ) : null}
    </>
  );
}
