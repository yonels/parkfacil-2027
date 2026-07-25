"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, BookOpen, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { navigationItems } from "@/config/navigation";
import { useState } from "react";

export default function Sidebar({ collapsed, onToggle }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const linkClasses = (active) =>
    `flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition ${active ? "bg-[#EEF4FF] text-[#3150D8] shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-[#041E42]"}`;

  return (
    <>
      <aside className={`hidden h-screen flex-col border-r border-slate-200 bg-white px-4 py-5 shadow-sm lg:flex ${collapsed ? "w-24" : "w-72"}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#041E42] text-lg font-semibold text-white">P</div>
            {!collapsed ? <div><p className="text-sm font-semibold text-[#041E42]">ParkFacil</p><p className="text-xs text-slate-500">Plataforma</p></div> : null}
          </div>
          <button aria-label={collapsed ? "Expandir menú" : "Contraer menú"} onClick={onToggle} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-[#3150D8]">
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        <nav className="mt-8 flex-1 space-y-1.5">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            const isFuture = item.future;

            if (item.href) {
              return (
                <Link key={item.label} href={item.href} className={linkClasses(isActive)}>
                  <Icon className="h-4.5 w-4.5" />
                  {!collapsed ? <span>{item.label}</span> : null}
                </Link>
              );
            }

            return (
              <div key={item.label} className={linkClasses(false)}>
                <Icon className="h-4.5 w-4.5" />
                {!collapsed ? <span>{item.label}</span> : null}
                {!collapsed ? <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Próximamente</span> : null}
              </div>
            );
          })}
        </nav>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Documentación</p>
          <p className="mt-2 text-sm text-slate-600">Consulta la base documental y las etapas del proyecto.</p>
          <Link href="/documentos" className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#041E42] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#0B3D91]">
            <BookOpen className="h-4 w-4" />
            Ver documentación
          </Link>
        </div>
      </aside>

      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#041E42] text-sm font-semibold text-white">P</div>
          <div>
            <p className="text-sm font-semibold text-[#041E42]">ParkFacil</p>
            <p className="text-xs text-slate-500">Plataforma base</p>
          </div>
        </div>
        <button aria-label="Abrir menú" onClick={() => setMobileOpen(true)} className="rounded-full p-2 text-slate-600 transition hover:bg-slate-100">
          <PanelLeftOpen className="h-5 w-5" />
        </button>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" onClick={() => setMobileOpen(false)}>
          <div className="h-full w-80 max-w-[85%] bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#041E42] text-sm font-semibold text-white">P</div>
                <div>
                  <p className="text-sm font-semibold text-[#041E42]">ParkFacil</p>
                  <p className="text-xs text-slate-500">Plataforma base</p>
                </div>
              </div>
              <button aria-label="Cerrar menú" onClick={() => setMobileOpen(false)} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100">
                <PanelLeftClose className="h-5 w-5" />
              </button>
            </div>
            <nav className="mt-6 space-y-1.5">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;

                if (item.href) {
                  return (
                    <Link key={item.label} href={item.href} onClick={() => setMobileOpen(false)} className={linkClasses(isActive)}>
                      <Icon className="h-4.5 w-4.5" />
                      <span>{item.label}</span>
                    </Link>
                  );
                }

                return (
                  <div key={item.label} className={linkClasses(false)}>
                    <Icon className="h-4.5 w-4.5" />
                    <span>{item.label}</span>
                    <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Próximamente</span>
                  </div>
                );
              })}
            </nav>
          </div>
        </div>
      ) : null}
    </>
  );
}
