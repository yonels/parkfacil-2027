"use client";

// Menú de los portales Cliente y Root (SOL-2026-11-04-014 y SOL-2026-11-05-001), con el
// estilo del panel de «Configurar empresa». Las opciones salen del mismo árbol y del mismo
// filtro de permisos que el menú anterior.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, BookOpen, Building2, ChevronRight, CircleUserRound, Handshake, KeyRound, LayoutGrid, LoaderCircle, LogOut, MapPinned, Menu, MessageSquareText, PanelLeftClose, PanelLeftOpen, ParkingSquare, ScanLine, Search, Settings2, ShieldCheck, UserRound, Users, X } from "lucide-react";
import { navigationItems } from "@/config/navigation";
import { navigationVisibleForRole } from "@/lib/auth/permissions.mjs";
import { CLIENT_MENU_SECTIONS, countMenuOptions, filterMenuTree, hideUnhiredProducts, portalMenuSections, ROOT_MENU_SECTIONS } from "@/lib/portalSidebarCore.mjs";
import { activeTreeKeys, filterVisibleTree, isItemActive, isTreeActive, matchesActivePrefix, projectClientAdministrationNode, projectSingleProductParkingNode, toggleExpandedNode } from "@/lib/navigationTreeCore.mjs";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

const STORAGE_KEY = "parkfacil.client-sidebar.expanded.v1";

const ITEM_STYLES = {
  "Off Street": { icon: ParkingSquare, color: "#3150D8" },
  "On Street": { icon: MapPinned, color: "#C17A4F" },
  Inicio: { icon: LayoutGrid, color: "#0891B2", note: "Resumen de tu empresa" },
  "Dashboard General": { icon: BarChart3, color: "#7C3AED", note: "Indicadores" },
  "Data Entry": { icon: ScanLine, color: "#0F766E", note: "Demostración del POS" },
  Administración: { icon: Settings2, color: "#EA580C" },
  "Centro de Control SMS": { icon: MessageSquareText, color: "#DB2777" },
  Administradores: { icon: Users, color: "#0F766E" },
  Operadores: { icon: UserRound, color: "#EA580C" },
  "Claves de operadores": { icon: KeyRound, color: "#CA8A04", note: "Reporte" },
  Seguridad: { icon: ShieldCheck, color: "#0284C7", note: "Accesos y sesiones" },
  "Mi Cuenta": { icon: CircleUserRound, color: "#475569", note: "Datos de la cuenta" },
  Convenios: { icon: Handshake, color: "#059669", note: "Beneficios de tu empresa" },
  "Documentación": { icon: BookOpen, color: "#4F46E5", note: "Guías del sistema" },
};
const DEFAULT_STYLE = { icon: LayoutGrid, color: "#475569" };

function readExpanded(items, pathname) {
  const active = activeTreeKeys(items, pathname);
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    return Array.isArray(stored) ? [...new Set([...stored, ...active])] : active;
  } catch {
    return active;
  }
}

function Tile({ item }) {
  const { icon: Icon, color } = ITEM_STYLES[item.label] || DEFAULT_STYLE;
  return <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] text-white" style={{ background: color }}><Icon className="h-4 w-4" aria-hidden="true" /></span>;
}

function PortalIdentity({ userContext }) {
  const isRoot = userContext?.role === "platform_admin";
  const title = isRoot ? "ParkFacil" : userContext?.companyLegalName || "Empresa";
  const detail = isRoot ? "Portal Root" : userContext?.companyRut ? `RUT ${userContext.companyRut}` : "";
  return (
    <div className="min-w-0 flex-1">
      <p title={title} className="line-clamp-2 text-sm font-extrabold leading-tight text-[#041E42]">{title}</p>
      {detail ? <p className="mt-0.5 truncate text-xs font-semibold text-slate-600">{detail}</p> : null}
    </div>
  );
}

export default function PortalSidebar({ collapsed, onToggle, userContext, clientContext, mobileOpen, onMobileOpenChange }) {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const navRef = useRef(null);

  const isRoot = userContext?.role === "platform_admin";
  const definitions = isRoot ? ROOT_MENU_SECTIONS : CLIENT_MENU_SECTIONS;
  const items = useMemo(() => {
    const isVisible = (item) => navigationVisibleForRole(item, userContext) && (!clientContext || !item.requiresModule || clientContext.modules?.includes(item.requiresModule));
    // Root conserva el árbol completo; las proyecciones son solo del Portal Cliente.
    if (userContext?.role === "platform_admin") return filterVisibleTree(navigationItems, isVisible);
    return hideUnhiredProducts(projectClientAdministrationNode(projectSingleProductParkingNode(filterVisibleTree(navigationItems, isVisible))), userContext?.enabledProducts);
  }, [clientContext, userContext]);
  const [expanded, setExpanded] = useState(() => readExpanded(items, pathname));

  const searching = Boolean(query.trim());
  const sections = useMemo(() => portalMenuSections(filterMenuTree(items, query), definitions), [items, query, definitions]);

  // Cada página vuelve a montar el menú: se centra la opción activa una sola vez.
  const scrolledPath = useRef(null);
  useEffect(() => {
    if (scrolledPath.current === pathname || !navRef.current) return;
    const active = navRef.current.querySelector('[aria-current="page"]');
    if (!active) return;
    scrolledPath.current = pathname;
    const nav = navRef.current.getBoundingClientRect();
    const box = active.getBoundingClientRect();
    if (box.top < nav.top || box.bottom > nav.bottom) navRef.current.scrollTop += box.top - nav.top - (nav.height - box.height) / 2;
  }, [pathname, expanded, collapsed]);

  function toggle(key) {
    setExpanded((current) => {
      const next = toggleExpandedNode(current, key);
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* El menú sigue funcionando sin almacenamiento. */ }
      return next;
    });
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
      await getSupabaseBrowserClient().auth.signOut();
      router.replace("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  const renderChild = (child, parentKey, onStreet, onNavigate) => {
    const key = `${parentKey}/${child.label}`;
    // Un enlace a una sección de la página (#) no se marca: el menú no conoce esa posición.
    const active = matchesActivePrefix(pathname, child.activePrefix) || (!child.href?.includes("#") && isItemActive(pathname, child.href));
    const activeClasses = onStreet ? "border-[var(--pf-color-onstreet-primary-700)] bg-[var(--pf-color-onstreet-tint)] text-[var(--pf-color-onstreet-primary-700)]" : "border-[#3150D8] bg-indigo-50 text-[#3150D8]";
    const base = "flex w-full items-center gap-1.5 rounded-r-xl border-l-2 px-2.5 py-1.5 text-left text-[12.5px] font-bold leading-snug";
    const idle = "border-slate-200 text-slate-700 hover:bg-slate-50";
    if (child.children?.length) {
      const open = searching || expanded.includes(key);
      return (
        <div key={child.label}>
          <button type="button" aria-expanded={open} onClick={() => toggle(key)} className={`${base} ${!open && isTreeActive(pathname, child) ? activeClasses : idle}`}>
            <ChevronRight className={`h-3 w-3 shrink-0 text-slate-400 transition ${open ? "rotate-90" : ""}`} aria-hidden="true" />
            <span className="min-w-0 flex-1">{child.label}</span>
          </button>
          {open ? <div className="ml-3">{child.children.map((grandchild) => renderChild(grandchild, key, onStreet, onNavigate))}</div> : null}
        </div>
      );
    }
    if (!child.href) return null;
    return <Link key={child.label} href={child.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={`${base} ${active ? activeClasses : idle}`}><span className="min-w-0 flex-1">{child.label}</span></Link>;
  };

  const renderItem = (item, onNavigate) => {
    const active = isTreeActive(pathname, item);
    const style = ITEM_STYLES[item.label] || DEFAULT_STYLE;
    const label = (subtitle) => <span className="min-w-0 flex-1 leading-tight"><b className="block truncate text-[13.5px] text-[#041E42]">{item.label}</b>{subtitle ? <small className="block truncate text-[11px] text-slate-500">{subtitle}</small> : null}</span>;
    if (item.children?.length) {
      const open = searching || expanded.includes(item.label);
      const options = countMenuOptions(item);
      return (
        <div key={item.label}>
          <button type="button" aria-expanded={open} onClick={() => toggle(item.label)} title={item.label} className={`flex w-full items-center gap-2 rounded-xl p-1.5 text-left hover:bg-slate-50 ${open ? "bg-slate-50" : ""} ${!open && active ? "bg-indigo-50" : ""}`}>
            <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition ${open ? "rotate-90" : ""}`} aria-hidden="true" />
            <Tile item={item} />
            {label(`${options} ${options === 1 ? "opción" : "opciones"}`)}
          </button>
          {open ? <div className="ml-6">{item.children.map((child) => renderChild(child, item.label, item.label === "On Street", onNavigate))}</div> : null}
        </div>
      );
    }
    if (!item.href) return <div key={item.label} className="flex w-full items-center gap-2 rounded-xl p-1.5 opacity-60"><span className="w-3.5 shrink-0" /><Tile item={item} />{label("Próximamente")}</div>;
    return <Link key={item.label} href={item.href} onClick={onNavigate} title={item.label} aria-current={active ? "page" : undefined} className={`flex w-full items-center gap-2 rounded-xl p-1.5 text-left hover:bg-slate-50 ${active ? "bg-indigo-50" : ""}`}><span className="w-3.5 shrink-0" /><Tile item={item} />{label(style.note)}</Link>;
  };

  const panelBody = (onNavigate, withRef) => (
    <>
      <div className="px-2 pt-2">
        <label className="flex items-center gap-2 rounded-xl border border-slate-300 px-2.5 py-1.5 focus-within:border-[#3150D8]">
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar opción…" aria-label="Buscar opción del menú" className="w-full min-w-0 bg-transparent text-[13px] outline-none" />
        </label>
      </div>
      <nav ref={withRef ? navRef : undefined} aria-label={isRoot ? "Menú del Portal Root" : "Menú del Portal Cliente"} className="min-h-0 flex-1 overflow-y-auto p-2">
        {sections.length ? sections.map((section) => (
          <div key={section.id}>
            <p className="mx-1.5 mb-1 mt-2.5 text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-slate-400 first:mt-0.5">{section.title}</p>
            {section.items.map((item) => renderItem(item, onNavigate))}
          </div>
        )) : <p className="p-4 text-center text-[13px] text-slate-500">No hay opciones que coincidan.</p>}
      </nav>
      <div className="flex shrink-0 items-center gap-2 border-t border-slate-200 px-3 py-2">
        <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-[#3150D8] text-[11px] font-extrabold text-white" aria-hidden="true">{String(userContext?.name || "U").trim().slice(0, 2).toUpperCase()}</span>
        <div className="min-w-0 flex-1 leading-tight"><b className="block truncate text-[12.5px] text-[#041E42]">{userContext?.name}</b><small className="text-[11px] text-slate-500">{isRoot ? "Administrador de plataforma" : "Administrador de empresa"}</small></div>
        <button type="button" onClick={signOut} disabled={signingOut} title="Cerrar sesión" aria-label="Cerrar sesión" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-50">{signingOut ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogOut className="h-4 w-4" aria-hidden="true" />}</button>
      </div>
    </>
  );

  const openFromRail = (item) => {
    if (!expanded.includes(item.label)) toggle(item.label);
    onToggle();
  };

  return (
    <>
      <aside data-testid="portal-sidebar" className={`sticky top-0 hidden h-screen shrink-0 p-2 lg:block ${collapsed ? "w-[78px]" : "w-[300px]"}`}>
        <div className="pf-sidebar flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className={`flex shrink-0 items-center gap-2 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-fuchsia-50 py-3 ${collapsed ? "justify-center px-0" : "px-3"}`}>
            {!collapsed ? <><Building2 className="h-[18px] w-[18px] shrink-0 text-[#3150D8]" aria-hidden="true" /><PortalIdentity userContext={userContext} /></> : null}
            <button type="button" onClick={onToggle} title={collapsed ? "Mostrar menú" : "Plegar menú"} aria-label={collapsed ? "Mostrar menú" : "Plegar menú"} aria-expanded={!collapsed} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-white">{collapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden="true" /> : <PanelLeftClose className="h-4 w-4" aria-hidden="true" />}</button>
          </div>
          {collapsed ? (
            <nav ref={navRef} aria-label={isRoot ? "Menú del Portal Root" : "Menú del Portal Cliente"} className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1.5">
              {portalMenuSections(items, definitions).flatMap((section) => section.items).map((item) => {
                const active = isTreeActive(pathname, item);
                const classes = `flex w-full justify-center rounded-xl py-1.5 hover:bg-slate-50 ${active ? "bg-indigo-50" : ""}`;
                if (item.children?.length) return <button key={item.label} type="button" onClick={() => openFromRail(item)} title={item.label} aria-label={item.label} className={classes}><Tile item={item} /></button>;
                return item.href ? <Link key={item.label} href={item.href} title={item.label} aria-label={item.label} aria-current={active ? "page" : undefined} className={classes}><Tile item={item} /></Link> : null;
              })}
            </nav>
          ) : panelBody(undefined, true)}
        </div>
      </aside>

      <div className="flex items-center gap-2 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-fuchsia-50 px-4 py-3 lg:hidden">
        <Building2 className="h-[18px] w-[18px] shrink-0 text-[#3150D8]" aria-hidden="true" />
        <PortalIdentity userContext={userContext} />
        <button type="button" onClick={() => onMobileOpenChange(true)} aria-label="Abrir menú" className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-[#041E42] hover:border-[#3150D8]"><Menu className="h-4 w-4" aria-hidden="true" />Menú</button>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" onClick={() => onMobileOpenChange(false)}>
          <div className="pf-sidebar flex h-full w-80 max-w-[88%] flex-col bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-fuchsia-50 p-3">
              <Building2 className="h-[18px] w-[18px] shrink-0 text-[#3150D8]" aria-hidden="true" />
              <PortalIdentity userContext={userContext} />
              <button type="button" onClick={() => onMobileOpenChange(false)} aria-label="Cerrar menú" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-white"><X className="h-4 w-4" aria-hidden="true" /></button>
            </div>
            {panelBody(() => onMobileOpenChange(false), false)}
          </div>
        </div>
      ) : null}
    </>
  );
}
