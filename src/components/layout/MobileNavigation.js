"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigationItems } from "@/config/navigation";
import { navigationVisibleForRole } from "@/lib/auth/permissions.mjs";
import { useOperatorAccessUrl } from "@/lib/auth/useOperatorAccessUrl";
import { matchesActivePrefix, activeTreeKeys, toggleExpandedNode, filterVisibleTree, projectSingleProductParkingNode } from "@/lib/navigationTreeCore.mjs";
import { useState } from "react";

export default function MobileNavigation({ onNavigate, clientContext, userContext }) {
  const pathname = usePathname();
  const operatorAccessUrl = useOperatorAccessUrl();
  const isPlatformAdmin = userContext?.role === "platform_admin";

  // Mismo criterio de visibilidad y misma proyección "un solo producto ->
  // nodo promovido" que Sidebar.js (navigationTreeCore.mjs, sin lógica
  // duplicada -- ver §17/§18/§34).
  const isVisibleForContext = (item) => navigationVisibleForRole(item, userContext) && (!clientContext || !item.requiresModule || clientContext.modules?.includes(item.requiresModule));
  const filtered = filterVisibleTree(navigationItems, isVisibleForContext);
  const visibleItems = isPlatformAdmin ? filtered : projectSingleProductParkingNode(filtered);

  const [expandedNodes, setExpandedNodes] = useState(() => activeTreeKeys(visibleItems, pathname));
  const toggleFolder = (key) => setExpandedNodes((current) => toggleExpandedNode(current, key));

  const renderNode = (item, parentKey = "") => {
    const key = parentKey ? `${parentKey}/${item.label}` : item.label;
    const Icon = item.icon;
    const isActive = pathname === item.href || matchesActivePrefix(pathname, item.activePrefix);
    const activeClasses = item.label === "On Street" ? "bg-[var(--pf-color-onstreet-tint)] text-[var(--pf-color-onstreet-primary-700)]" : "bg-[#EEF4FF] text-[#3150D8]";

    if (item.children?.length) {
      const expanded = expandedNodes.includes(key);
      return <div key={key} className="min-w-[150px]"><button type="button" aria-expanded={expanded} onClick={() => toggleFolder(key)} className={`flex w-full items-center gap-2 rounded-2xl px-3 py-3 text-left text-sm ${isActive ? activeClasses : "bg-white text-slate-600 hover:bg-slate-50"}`}>{Icon ? <Icon className="h-4 w-4" /> : null}<span className="flex-1">{item.label}</span><span aria-hidden="true">{expanded ? "−" : "+"}</span></button>{expanded ? <div className="mt-1 space-y-1 border-l border-slate-200 pl-2">{item.children.map((child) => renderNode(child, key))}</div> : null}</div>;
    }

    if (!item.href) return <div key={key} className="min-w-[120px] rounded-2xl bg-slate-50 px-3 py-3 text-sm text-slate-500">{item.label}</div>;
    if (item.platformAdminGateway && isPlatformAdmin) return <a key={key} href={operatorAccessUrl} onClick={onNavigate} className="block min-w-[120px] rounded-2xl px-3 py-3 text-sm text-slate-600">{item.label}</a>;
    return <Link key={key} href={item.href} onClick={onNavigate} className={`block min-w-[120px] rounded-2xl px-3 py-3 text-sm ${isActive ? activeClasses : "bg-white text-slate-600 hover:bg-slate-50"}`}>{item.label}</Link>;
  };

  return (
    <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm lg:hidden" aria-label="Navegación móvil">
      {visibleItems.map((item) => renderNode(item))}
    </nav>
  );
}
