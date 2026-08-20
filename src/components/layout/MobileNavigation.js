"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigationItems } from "@/config/navigation";
import { navigationVisibleForRole } from "@/lib/auth/permissions.mjs";
import { useOperatorAccessUrl } from "@/lib/auth/useOperatorAccessUrl";

export default function MobileNavigation({ onNavigate, clientContext, userContext }) {
  const pathname = usePathname();
  const operatorAccessUrl = useOperatorAccessUrl();
  const isPlatformAdmin = userContext?.role === "platform_admin";

  return (
    <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm lg:hidden" aria-label="Navegación móvil">
      {navigationItems.filter((item) => navigationVisibleForRole(item, userContext) && (!clientContext || !item.requiresModule || clientContext.modules?.includes(item.requiresModule))).map((item) => {
        const Icon = item.icon;
        // Igual que en Sidebar.js: activePrefix resalta el padre (p. ej.
        // "Usuarios") también en sub-rutas como fichas de detalle, que no
        // coinciden exactamente con su href. Mobile no muestra el árbol de
        // hijos (comportamiento ya existente para Facturación/Tarifas/
        // Dispositivos, sin cambios), solo mantiene el resaltado equivalente.
        const isActive = pathname === item.href || (item.activePrefix && (pathname === item.activePrefix || pathname.startsWith(`${item.activePrefix}/`)));

        if (!item.href) {
          return (
            <div key={item.label} className="flex min-w-[120px] flex-col items-start gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Próximamente</span>
            </div>
          );
        }

        if (item.platformAdminGateway && isPlatformAdmin) {
          return (
            <a key={item.label} href={operatorAccessUrl} onClick={onNavigate} className="flex min-w-[120px] flex-col items-start gap-2 rounded-2xl px-3 py-3 text-sm bg-white text-slate-600 hover:bg-slate-50">
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </a>
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
