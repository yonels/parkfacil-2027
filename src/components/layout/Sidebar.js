"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, BookOpen, CircleUserRound, Mail, PanelLeftClose, PanelLeftOpen, ShieldCheck, UserRound } from "lucide-react";
import { navigationItems } from "@/config/navigation";
import { navigationVisibleForRole } from "@/lib/auth/permissions.mjs";
import { useOperatorAccessUrl } from "@/lib/auth/useOperatorAccessUrl";
import { isItemActive, matchesActivePrefix, isTreeActive, activeTreeKeys, initialExpandedNodes, toggleExpandedNode, filterVisibleTree, projectSingleProductParkingNode } from "@/lib/navigationTreeCore.mjs";
import { useMemo, useState } from "react";

const SIDEBAR_TREES_STORAGE_KEY = "parkfacil.sidebar.expanded.v2";

function readInitialExpandedNodes(pathname) {
  const activeKeys = [...new Set(activeTreeKeys(navigationItems, pathname).flatMap((key) => [key, key.split("/").at(-1)]))];
  if (typeof window === "undefined") return activeKeys;
  try {
    const stored = JSON.parse(window.localStorage.getItem(SIDEBAR_TREES_STORAGE_KEY) || "null");
    return initialExpandedNodes({ storedOpenKeys: stored, items: navigationItems, pathname });
  } catch {
    return activeKeys;
  }
}

function formatDate(value) {
  if (!value) return "No disponible";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "No disponible";
  return parsed.toLocaleString("es-CL");
}

const sectionDefinitions = [
  {
    id: "plataforma",
    title: "Plataforma",
    // "Off Street"/"On Street" solo aparecen aquí sueltos (fuera del árbol
    // de "Estacionamientos") cuando projectSingleProductParkingNode los
    // promovió a nivel superior para un Cliente con un único producto
    // habilitado -- ver §17/§18 de la auditoría de acceso por producto.
    labels: ["Inicio", "Dashboard", "Data Entry", "Operación", "Turnos", "Estacionamientos", "Off Street", "On Street", "Seguridad", "Recaudación", "Medios de Pago", "Monitoreo"],
  },
  {
    id: "administracion",
    title: "Administración",
    labels: ["Empresas", "Usuarios", "Turnos", "Gestión de módulos", "Contratos", "Abonados y Credenciales", "Tarifas", "Dispositivos", "Facturación", "Reportes", "Administración", "Integraciones"],
  },
  {
    id: "soporte",
    title: "Soporte",
    labels: ["Documentación"],
  },
];

const FOLDER_PALETTES = {
  plataforma: { top: "#6D8CFF", body: "#AFC3FF", line: "#4B67D2" },
  administracion: { top: "#F5B249", body: "#FFD27C", line: "#D49331" },
  soporte: { top: "#5FBF95", body: "#9EE0C1", line: "#3E9873" },
  // Identidad On Street (cobrizo) -- ver §12/§16 de la auditoría de acceso
  // por producto. Solo se usa para el ítem "On Street" mientras esa rama
  // está activa, nunca para el resto de la sección "Plataforma".
  onstreet: { top: "#C17A4F", body: "#E3B08D", line: "#7C3F22" },
  default: { top: "#F5B249", body: "#FFD27C", line: "#D49331" },
};

function getSectionColorKey(itemLabel) {
  const section = sectionDefinitions.find((entry) => entry.labels.includes(itemLabel));
  return section?.id || "default";
}

function FolderItemIcon({ tone = "default" }) {
  const palette = FOLDER_PALETTES[tone] || FOLDER_PALETTES.default;
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" className="h-[18px] w-[18px] shrink-0">
      <path d="M1.25 4.75C1.25 3.7835 2.0335 3 3 3H6.1C6.536 3 6.958 3.161 7.284 3.452L8.066 4.148C8.392 4.439 8.814 4.6 9.25 4.6H15C15.9665 4.6 16.75 5.3835 16.75 6.35V7H1.25V4.75Z" fill={palette.top} />
      <path d="M1.25 7H16.75V13.25C16.75 14.2165 15.9665 15 15 15H3C2.0335 15 1.25 14.2165 1.25 13.25V7Z" fill={palette.body} />
      <path d="M1.25 7H16.75" stroke={palette.line} strokeWidth="1" />
      <path d="M3 14.5H15" stroke={palette.line} strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

export default function Sidebar({ collapsed, onToggle, onHomeNavigate, clientContext, userContext }) {
  const pathname = usePathname();
  const operatorAccessUrl = useOperatorAccessUrl();
  const isPlatformAdmin = userContext?.role === "platform_admin";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openSections, setOpenSections] = useState(["plataforma", "administracion"]);
  const [openTrees, setOpenTrees] = useState(() => readInitialExpandedNodes(pathname));
  const [showAccountDetails, setShowAccountDetails] = useState(false);
  const [showMobileAccountDetails, setShowMobileAccountDetails] = useState(false);
  const normalizedOpenSections = Array.isArray(openSections)
    ? openSections
    : (typeof openSections === "string" && openSections ? [openSections] : []);

  const linkClasses = (active) =>
    `flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition ${active ? "bg-[#EEF4FF] text-[#3150D8] shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-[#041E42]"}`;

  const visibleItems = useMemo(() => {
    // Mismo criterio de visibilidad que ya se aplicaba solo a los ítems de
    // primer nivel (navigationVisibleForRole + requiresModule), ahora
    // reutilizado también para los hijos. La navegación no concede
    // permisos — un hijo cuya propia ruta el rol actual no puede abrir
    // (p. ej. "On Street" para un operator, ver COMPANY_ADMIN_PREFIXES en
    // permissions.mjs) no debe listarse, aunque el padre
    // ("Estacionamientos") sí sea visible por su propio href.
    const isVisibleForContext = (item) =>
      navigationVisibleForRole(item, userContext) && (!clientContext || !item.requiresModule || clientContext.modules?.includes(item.requiresModule));
    const projected = filterVisibleTree(navigationItems, isVisibleForContext);
    // Root conserva siempre el árbol completo "Estacionamientos > Off
    // Street/On Street" (ver §6): la promoción a nivel superior solo aplica
    // al Portal Cliente, cuya empresa puede tener un único producto.
    return isPlatformAdmin ? projected : projectSingleProductParkingNode(projected);
  }, [clientContext, userContext, isPlatformAdmin]);

  const sections = useMemo(
    () => sectionDefinitions.map((section) => ({
      ...section,
      items: section.labels
        .map((label) => visibleItems.find((item) => item.label === label))
        .filter(Boolean),
    })).filter((section) => section.items.length > 0),
    [visibleItems],
  );

  const toggleTree = (key) => setOpenTrees((current) => {
    const next = toggleExpandedNode(current, key);
    try {
      window.localStorage.setItem(SIDEBAR_TREES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // El estado local sigue funcionando aunque el navegador bloquee storage.
    }
    return next;
  });

  // Nodo hijo dentro de un árbol ya expandido. Si el propio hijo tiene
  // children (p. ej. "On Street" bajo "Estacionamientos"), se renderiza como
  // su propio sub-árbol expandible (mismo patrón: ChevronDown que rota,
  // línea/indentación estilo Windows, highlight de la opción activa),
  // anidado un nivel más. Si no, es un enlace simple como antes — pero el
  // highlight ahora también respeta activePrefix, no solo igualdad exacta de
  // pathname (rutas de detalle bajo ese hijo también lo mantienen resaltado).
  // Identidad On Street: cobrizo (ver §12/§16 de la auditoría de acceso por
  // producto). Se aplica únicamente al nodo "On Street" (nested bajo
  // Estacionamientos, o promovido a nivel superior para un Cliente
  // exclusivamente On Street) y solo mientras esa rama está activa -- el
  // resto del Sidebar conserva el azul corporativo siempre.
  const isOnStreetLabel = (label) => label === "On Street";

  const renderChild = (child, onNavigate, onStreetBranch = false, parentKey = "") => {
    const childActive = matchesActivePrefix(pathname, child.activePrefix) || isItemActive(pathname, child.href);
    const branch = onStreetBranch || isOnStreetLabel(child.label);
    const activeClasses = branch
      ? "bg-[var(--pf-color-onstreet-tint)] text-[var(--pf-color-onstreet-primary-700)]"
      : "bg-[#EEF4FF] text-[#3150D8]";
    const hoverClasses = branch
      ? "text-slate-600 hover:bg-[var(--pf-color-onstreet-tint)] hover:text-[var(--pf-color-onstreet-primary-700)]"
      : "text-slate-600 hover:bg-[#EEF4FF] hover:text-[#3150D8]";

    if (child.children?.length) {
      const childKey = parentKey ? `${parentKey}/${child.label}` : child.label;
      const childExpanded = openTrees.includes(childKey);
      return (
        <div key={child.label} className="relative">
          <button type="button" aria-label={`${childExpanded ? "Contraer" : "Expandir"} ${child.label}`} aria-expanded={childExpanded} onClick={() => toggleTree(childKey)} className={`relative flex w-full items-center gap-1 rounded-lg px-3 py-2 text-left text-xs font-medium transition before:absolute before:-left-3 before:top-1/2 before:w-3 before:border-t before:border-slate-300 ${childActive ? activeClasses : hoverClasses}`}>
            <span className="min-w-0 flex-1">{child.label}</span>
              <ChevronDown className={`h-3.5 w-3.5 transition ${childExpanded ? "rotate-180" : ""}`} />
          </button>
          {childExpanded ? (
            <div className="relative ml-4 mt-0.5 space-y-0.5 border-l border-slate-300 pl-3">
              {child.children.map((grandchild) => renderChild(grandchild, onNavigate, branch, childKey))}
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <Link key={child.href} href={child.href} onClick={onNavigate} className={`relative block rounded-lg px-3 py-2 text-xs font-medium transition before:absolute before:-left-3 before:top-1/2 before:w-3 before:border-t before:border-slate-300 ${childActive ? activeClasses : hoverClasses}`}>
        {child.label}
      </Link>
    );
  };

  const renderNavItem = (item, onNavigate, tone) => {
    const active = isTreeActive(pathname, item);
    const onStreetItem = isOnStreetLabel(item.label);
    const onStreetActive = onStreetItem && active;
    const itemClasses = onStreetActive
      ? `flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition bg-[var(--pf-color-onstreet-tint)] text-[var(--pf-color-onstreet-primary-700)] shadow-sm`
      : linkClasses(active);

    if (item.children?.length) {
      const treeKey = item.label;
      const expanded = openTrees.includes(treeKey);
      return (
        <div key={item.label} className="relative">
          <button type="button" aria-label={`${expanded ? "Contraer" : "Expandir"} ${item.label}`} aria-expanded={expanded} onClick={() => toggleTree(treeKey)} className={`${itemClasses} w-full text-left`}>
            <FolderItemIcon tone={onStreetItem ? "onstreet" : tone} />
            <span className="min-w-0 flex-1">{item.label}</span>
            <ChevronDown className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`} />
          </button>
          {expanded ? (
            <div className="relative ml-6 mt-1 space-y-0.5 border-l border-slate-300 pl-3">
              {item.children.map((child) => renderChild(child, onNavigate, onStreetItem, treeKey))}
            </div>
          ) : null}
        </div>
      );
    }

    if (item.platformAdminGateway && isPlatformAdmin) {
      // Root nunca abre esta ruta con su propia sesión: se le lleva al login
      // real de operador en el origen del Portal Cliente (navegación
      // completa, misma pestaña — la sesión Root en este origen no se toca).
      return (
        <a key={item.label} href={operatorAccessUrl} onClick={onNavigate} className={linkClasses(active)}>
          <FolderItemIcon tone={tone} />
          <span>{item.label}</span>
        </a>
      );
    }

    if (item.href) {
      return (
        <Link key={item.label} href={item.href} onClick={onNavigate} className={linkClasses(active)}>
          <FolderItemIcon tone={tone} />
          <span>{item.label}</span>
        </Link>
      );
    }

    return (
      <div key={item.label} className={linkClasses(false)}>
        <FolderItemIcon tone={tone} />
        <span>{item.label}</span>
        <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Próximamente</span>
      </div>
    );
  };

  const renderAccordion = (onNavigate) => (
    <div className="space-y-2">
      {sections.map((section) => {
        const expanded = normalizedOpenSections.includes(section.id);
        const containsActive = section.items.some((item) => isTreeActive(pathname, item));
        return (
          <section key={section.id} className="rounded-2xl border border-slate-200 bg-white p-2">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpenSections((currentRaw) => {
                const current = Array.isArray(currentRaw)
                  ? currentRaw
                  : (typeof currentRaw === "string" && currentRaw ? [currentRaw] : []);
                return current.includes(section.id)
                  ? current.filter((id) => id !== section.id)
                  : [...current, section.id];
              })}
              className={`flex w-full items-center justify-between rounded-xl px-2 py-2 text-left text-xs font-semibold uppercase tracking-[0.18em] transition ${containsActive ? "text-[#3150D8]" : "text-slate-500 hover:text-[#041E42]"}`}
            >
              <span>{section.title}</span>
              <ChevronDown className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`} />
            </button>
            {expanded ? <div className="mt-1 space-y-1">{section.items.map((item) => renderNavItem(item, onNavigate, section.id))}</div> : null}
          </section>
        );
      })}
    </div>
  );

  // Solo un Cliente con AMBOS productos habilitados necesita distinguir cuál
  // está usando (ver §19 de la auditoría de acceso por producto) -- con un
  // único producto no hay ambigüedad (Root nunca ve este indicador; ambos
  // ítems ya conviven en su árbol igual que hoy). Se deriva de la ruta
  // activa, no de un selector con estado propio: no hay dos formas de saber
  // "qué operación estoy usando" en la misma pantalla.
  const isMixedProductClient = !isPlatformAdmin && Array.isArray(userContext?.enabledProducts) && userContext.enabledProducts.length === 2;
  const currentOperation = matchesActivePrefix(pathname, "/on-street-qr") ? "On Street" : matchesActivePrefix(pathname, "/estacionamientos") ? "Off Street" : null;

  const showOperationIndicator = isMixedProductClient && Boolean(currentOperation) && !collapsed;
  const operationIndicatorOnStreet = currentOperation === "On Street";
  const operationIndicator = showOperationIndicator ? (
    <div className={`mt-4 flex items-center justify-between rounded-2xl border px-3 py-2.5 text-xs font-semibold ${operationIndicatorOnStreet ? "border-[var(--pf-color-onstreet-border)] bg-[var(--pf-color-onstreet-tint)] text-[var(--pf-color-onstreet-primary-700)]" : "border-[#BFD2FF] bg-[#EEF4FF] text-[#3150D8]"}`}>
      <span className="uppercase tracking-[0.08em] opacity-80">Operación actual</span>
      <span className="rounded-full bg-white/70 px-2.5 py-1">{currentOperation}</span>
    </div>
  ) : null;

  return (
    <>
      <aside className={`relative sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white px-4 py-5 shadow-sm lg:flex ${collapsed ? "w-24" : "w-72"}`}>
        <div className="flex items-center justify-between gap-3">
          <Link href="/" onClick={onHomeNavigate} aria-label="Ir al inicio" className="flex items-center gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3150D8] focus-visible:ring-offset-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#041E42] text-lg font-semibold text-white">P</div>
            {!collapsed ? <div><p className="text-sm font-semibold text-[#041E42]">ParkFacil</p><p className="text-xs text-slate-500">Plataforma</p></div> : null}
          </Link>
          <button aria-label={collapsed ? "Expandir menú" : "Contraer menú"} onClick={onToggle} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-[#3150D8]">
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
        {operationIndicator}

        <nav className="mt-8 min-h-0 flex-1 overflow-y-auto pr-1">
          {collapsed ? (
            <div className="space-y-1.5">
              {visibleItems.map((item) => {
                const active = isTreeActive(pathname, item);
                const onStreetItem = isOnStreetLabel(item.label);
                const tone = onStreetItem ? "onstreet" : getSectionColorKey(item.label);
                const itemClasses = onStreetItem && active
                  ? "flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition bg-[var(--pf-color-onstreet-tint)] text-[var(--pf-color-onstreet-primary-700)] shadow-sm"
                  : linkClasses(active);
                if (item.platformAdminGateway && isPlatformAdmin) {
                  return (
                    <a key={item.label} href={operatorAccessUrl} className={itemClasses}>
                      <FolderItemIcon tone={tone} />
                    </a>
                  );
                }
                if (item.href) {
                  return (
                    <Link key={item.label} href={item.href} className={itemClasses}>
                      <FolderItemIcon tone={tone} />
                    </Link>
                  );
                }
                return (
                  <div key={item.label} className={linkClasses(false)}>
                    <FolderItemIcon tone={tone} />
                  </div>
                );
              })}
            </div>
          ) : renderAccordion(undefined)}
        </nav>

        <div className="mt-4 shrink-0 space-y-3">
          <div className="rounded-2xl border border-[#BFD2FF] bg-[#EEF4FF] p-3 shadow-sm">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={showAccountDetails ? "Ocultar datos de cuenta" : "Mostrar datos de cuenta"}
                aria-expanded={showAccountDetails}
                onClick={() => setShowAccountDetails((current) => !current)}
                className="grid h-8 w-8 place-items-center rounded-xl bg-[#3150D8] text-white transition hover:bg-[#1E5EFF]"
              >
                <CircleUserRound className="h-4 w-4" />
              </button>
              {!collapsed ? <p className="text-sm font-semibold text-[#041E42]">Cuenta</p> : null}
            </div>

            {!collapsed && showAccountDetails ? (
              userContext ? (
                <div className="mt-2 max-h-24 space-y-1.5 overflow-y-auto pr-1 text-xs text-slate-700">
                  <p className="inline-flex items-center gap-2"><UserRound className="h-3.5 w-3.5 text-[#3150D8]" />{userContext.name}</p>
                  <p className="inline-flex items-center gap-2 break-all"><Mail className="h-3.5 w-3.5 text-[#3150D8]" />{userContext.email || "Sin correo"}</p>
                  <p className="inline-flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-[#3150D8]" />Rol {userContext.role || "authenticated"}</p>
                  <p>ID {userContext.id || "No disponible"}</p>
                  <p>Ultimo acceso: {formatDate(userContext.lastSignInAt)}</p>
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-500">Sin sesión activa.</p>
              )
            ) : null}
          </div>

          {!collapsed ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Documentación</p>
              <p className="mt-2 text-sm text-slate-600">Consulta la base documental y las etapas del proyecto.</p>
              <Link href="/documentos" className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#041E42] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#0B3D91]">
                <BookOpen className="h-4 w-4" />
                Ver documentación
              </Link>
            </div>
          ) : null}
        </div>
      </aside>

      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <Link href="/" aria-label="Ir al inicio" className="flex items-center gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3150D8] focus-visible:ring-offset-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#041E42] text-sm font-semibold text-white">P</div>
          <div>
            <p className="text-sm font-semibold text-[#041E42]">ParkFacil</p>
            <p className="text-xs text-slate-500">Plataforma base</p>
          </div>
        </Link>
        <button aria-label="Abrir menú" onClick={() => setMobileOpen(true)} className="rounded-full p-2 text-slate-600 transition hover:bg-slate-100">
          <PanelLeftOpen className="h-5 w-5" />
        </button>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" onClick={() => setMobileOpen(false)}>
          <div className="h-full w-80 max-w-[85%] bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <Link href="/" onClick={() => setMobileOpen(false)} aria-label="Ir al inicio" className="flex items-center gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3150D8] focus-visible:ring-offset-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#041E42] text-sm font-semibold text-white">P</div>
                <div>
                  <p className="text-sm font-semibold text-[#041E42]">ParkFacil</p>
                  <p className="text-xs text-slate-500">Plataforma base</p>
                </div>
              </Link>
              <button aria-label="Cerrar menú" onClick={() => setMobileOpen(false)} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100">
                <PanelLeftClose className="h-5 w-5" />
              </button>
            </div>
            {operationIndicator}
            <nav className="mt-6 overflow-y-auto">{renderAccordion(() => setMobileOpen(false))}</nav>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={showMobileAccountDetails ? "Ocultar datos de cuenta" : "Mostrar datos de cuenta"}
                  aria-expanded={showMobileAccountDetails}
                  onClick={() => setShowMobileAccountDetails((current) => !current)}
                  className="grid h-8 w-8 place-items-center rounded-xl bg-[#3150D8] text-white transition hover:bg-[#1E5EFF]"
                >
                  <CircleUserRound className="h-4 w-4" />
                </button>
                <p className="text-sm font-semibold text-[#041E42]">Cuenta</p>
              </div>
              {showMobileAccountDetails ? (userContext ? (
                <div className="mt-3 space-y-2 text-xs text-slate-700">
                  <p className="inline-flex items-center gap-2"><UserRound className="h-3.5 w-3.5 text-[#3150D8]" />{userContext.name}</p>
                  <p className="inline-flex items-center gap-2 break-all"><Mail className="h-3.5 w-3.5 text-[#3150D8]" />{userContext.email || "Sin correo"}</p>
                  <p className="inline-flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-[#3150D8]" />Rol {userContext.role || "authenticated"}</p>
                  <p>ID {userContext.id || "No disponible"}</p>
                  <p>Telefono: {userContext.phone || "No disponible"}</p>
                  <p>Ultimo acceso: {formatDate(userContext.lastSignInAt)}</p>
                  <p>Creado: {formatDate(userContext.createdAt)}</p>
                  <p>Correo confirmado: {userContext.emailConfirmedAt ? "Si" : "No"}</p>
                </div>
              ) : <p className="mt-3 text-xs text-slate-500">Sin sesión activa.</p>) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
