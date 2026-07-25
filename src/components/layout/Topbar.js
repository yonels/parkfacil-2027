"use client";

import { Bell, Building2, CalendarDays, Clock3, Menu, ParkingSquare, ChevronDown } from "lucide-react";

function formatDateNow() {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

function formatTimeNow() {
  return new Intl.DateTimeFormat("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

export default function Topbar({ title, description, onMenuClick }) {
  const dateNow = formatDateNow();
  const timeNow = formatTimeNow();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white px-4 py-3 sm:px-5 lg:px-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-100 hover:text-[#3150D8] lg:hidden"
            aria-label="Abrir menú de navegación"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div>
            <p className="text-[29px] font-semibold leading-tight text-[#041E42]">{title}</p>
            {description ? <p className="text-xs text-slate-500">{description}</p> : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">
            <Building2 className="h-4 w-4 text-[#3150D8]" />
            <span>ParkFacil Operaciones</span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">
            <ParkingSquare className="h-4 w-4 text-[#3150D8]" />
            <span>Estacionamiento Principal</span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">
            <CalendarDays className="h-4 w-4 text-[#3150D8]" />
            <span>{dateNow}</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">
            <Clock3 className="h-4 w-4 text-[#3150D8]" />
            <span>{timeNow}</span>
          </div>
          <button type="button" className="relative rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-100" aria-label="Notificaciones">
            <Bell className="h-4 w-4 text-[#3150D8]" />
            <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#DC2626] px-1 text-[10px] font-semibold text-white">5</span>
          </button>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#3150D8] text-[11px] font-semibold text-white">AM</div>
            <div>
              <p className="font-semibold text-[#041E42]">Alejandro M.</p>
              <p className="text-[11px] text-slate-500">Administrador</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
