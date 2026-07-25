import Link from "next/link";
import { Bell, UserCircle2 } from "lucide-react";
import Breadcrumbs from "@/components/layout/Breadcrumbs";

export default function Topbar({ title, description, onMenuClick }) {
  return (
    <header className="border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur sm:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onMenuClick} className="rounded-full border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-100 hover:text-[#3150D8] lg:hidden" aria-label="Abrir menú de navegación">
            <span className="text-lg font-semibold">☰</span>
          </button>
          <div>
            <p className="text-sm font-medium text-[#3150D8]">{title}</p>
            {description ? <p className="text-sm text-slate-500">{description}</p> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Breadcrumbs />
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <Bell className="h-4 w-4" />
            <span>Notificaciones</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <UserCircle2 className="h-4 w-4" />
            <span>Usuario</span>
          </div>
        </div>
      </div>
    </header>
  );
}
