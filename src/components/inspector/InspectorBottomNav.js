import { Menu } from "lucide-react";
import { INSPECTOR_BOTTOM_NAV_ITEMS } from "./inspectorNavItems";
import { activeNavView } from "./inspectorViews.mjs";

// Barra inferior para teléfono (Etapa 1, sección 11): oculta desde md
// (tablet/desktop usan sidebar, sección 13). Respeta el safe-area inferior
// para no quedar detrás de la barra gestual de iOS/Android.
export default function InspectorBottomNav({ view, onNavigate, onOpenDrawer }) {
  const active = activeNavView(view);
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {INSPECTOR_BOTTOM_NAV_ITEMS.map(({ view: itemView, label, Icon }) => (
        <button
          key={itemView}
          onClick={() => onNavigate(itemView)}
          aria-current={active === itemView ? "page" : undefined}
          className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-bold ${active === itemView ? "text-[#3150D8]" : "text-slate-500"}`}
        >
          <Icon className="h-6 w-6" aria-hidden="true" />
          {label}
        </button>
      ))}
      <button onClick={onOpenDrawer} aria-label="Más opciones" className="flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-bold text-slate-500">
        <Menu className="h-6 w-6" aria-hidden="true" />
        Más
      </button>
    </nav>
  );
}
