import { ShieldCheck } from "lucide-react";
import { INSPECTOR_LOGOUT_ITEM, INSPECTOR_NAV_ITEMS } from "./inspectorNavItems";
import { activeNavView } from "./inspectorViews.mjs";

// Sidebar para tablet/desktop (Etapa 1, sección 13): reemplaza la barra
// inferior desde md -- no es la barra inferior ampliada, es la navegación
// completa (mismos destinos que el drawer "Más" de móvil).
export default function InspectorSidebar({ view, onNavigate, onLogout }) {
  const active = activeNavView(view);
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-[#041E42] text-white md:flex">
      <div className="flex items-center gap-2 p-5">
        <ShieldCheck className="h-7 w-7" aria-hidden="true" />
        <div>
          <p className="text-sm font-black leading-tight text-[#8FA8E8]">ParkFacil</p>
          <p className="text-lg font-black leading-tight">Inspectores</p>
        </div>
      </div>
      <nav aria-label="Menú principal" className="flex-1 space-y-1 px-3">
        {INSPECTOR_NAV_ITEMS.map(({ view: itemView, label, Icon }) => (
          <button
            key={itemView}
            onClick={() => onNavigate(itemView)}
            aria-current={active === itemView ? "page" : undefined}
            className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left font-bold ${active === itemView ? "bg-white text-[#041E42]" : "text-white/85 hover:bg-white/10"}`}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>
      <div className="p-3">
        <button onClick={onLogout} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left font-bold text-white/85 hover:bg-white/10">
          <INSPECTOR_LOGOUT_ITEM.Icon className="h-5 w-5" aria-hidden="true" />
          {INSPECTOR_LOGOUT_ITEM.label}
        </button>
      </div>
    </aside>
  );
}
