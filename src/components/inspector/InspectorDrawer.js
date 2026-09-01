"use client";
import { X } from "lucide-react";
import { INSPECTOR_LOGOUT_ITEM, INSPECTOR_NAV_ITEMS } from "./inspectorNavItems";
import { activeNavView } from "./inspectorViews.mjs";

// Menú "Más" (Etapa 1, sección 12): drawer solo para móvil (md:hidden en el
// overlay completo -- en desktop la navegación completa ya vive siempre
// visible en el sidebar, ver InspectorSidebar.js).
export default function InspectorDrawer({ open, view, onNavigate, onLogout, onClose }) {
  if (!open) return null;
  const active = activeNavView(view);
  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <button aria-label="Cerrar menú" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-2xl" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex items-center justify-between p-4">
          <p className="text-lg font-black text-[#041E42]">Más opciones</p>
          <button onClick={onClose} aria-label="Cerrar menú" className="grid h-10 w-10 place-items-center rounded-full hover:bg-slate-100">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <nav aria-label="Opciones del menú" className="flex-1 space-y-1 overflow-y-auto px-3">
          {INSPECTOR_NAV_ITEMS.map(({ view: itemView, label, Icon }) => (
            <button
              key={itemView}
              onClick={() => onNavigate(itemView)}
              aria-current={active === itemView ? "page" : undefined}
              className={`flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left font-bold ${active === itemView ? "bg-[#EEF4FF] text-[#3150D8]" : "text-[#041E42]"}`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>
        <div className="p-3">
          <button onClick={onLogout} className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left font-bold text-rose-600">
            <INSPECTOR_LOGOUT_ITEM.Icon className="h-5 w-5" aria-hidden="true" />
            {INSPECTOR_LOGOUT_ITEM.label}
          </button>
        </div>
      </div>
    </div>
  );
}
