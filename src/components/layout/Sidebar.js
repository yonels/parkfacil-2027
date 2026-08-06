"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, BookOpen, CircleUserRound, Mail, PanelLeftClose, PanelLeftOpen, ShieldCheck, UserRound } from "lucide-react";
import { navigationItems } from "@/config/navigation";
import { navigationVisibleForRole } from "@/lib/auth/permissions.mjs";
import { useMemo, useState } from "react";

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
    labels: ["Inicio", "Dashboard", "Data Entry", "Operación", "Estacionamientos", "Seguridad", "Recaudación", "Medios de Pago", "Monitoreo"],
  },
  {
    id: "administracion",
    title: "Administración",
    labels: ["Empresas", "Usuarios", "Gestión de módulos", "Contratos", "Abonados y Credenciales", "Tarifas y Planes", "Simulador de tarifas", "Dispositivos", "Reportes", "Administración", "Integraciones"],
  },
  {
    id: "soporte",
    title: "Soporte",
    labels: ["Documentación"],
  },
];

function isItemActive(pathname, href) {
  if (!href) return false;
  const [baseHref] = href.split("#");
  return pathname === baseHref;
}

export default function Sidebar({ collapsed, onToggle, onHomeNavigate, clientContext, userContext }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openSections, setOpenSections] = useState([]);
  const [showAccountDetails, setShowAccountDetails] = useState(false);
  const [showMobileAccountDetails, setShowMobileAccountDetails] = useState(false);
  const normalizedOpenSections = Array.isArray(openSections)
    ? openSections
    : (typeof openSections === "string" && openSections ? [openSections] : []);

  const linkClasses = (active) =>
    `flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition ${active ? "bg-[#EEF4FF] text-[#3150D8] shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-[#041E42]"}`;

  const visibleItems = useMemo(
    () => navigationItems.filter((item) => navigationVisibleForRole(item, userContext) && (!clientContext || !item.requiresModule || clientContext.modules?.includes(item.requiresModule))),
    [clientContext, userContext],
  );

  const sections = useMemo(
    () => sectionDefinitions.map((section) => ({
      ...section,
      items: section.labels
        .map((label) => visibleItems.find((item) => item.label === label))
        .filter(Boolean),
    })).filter((section) => section.items.length > 0),
    [visibleItems],
  );

  const renderNavItem = (item, onNavigate) => {
    const Icon = item.icon;
    const active = isItemActive(pathname, item.href);

    if (item.href) {
      return (
        <Link key={item.label} href={item.href} onClick={onNavigate} className={linkClasses(active)}>
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
  };

  const renderAccordion = (onNavigate) => (
    <div className="space-y-2">
      {sections.map((section) => {
        const expanded = normalizedOpenSections.includes(section.id);
        const containsActive = section.items.some((item) => isItemActive(pathname, item.href));
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
            {expanded ? <div className="mt-1 space-y-1">{section.items.map((item) => renderNavItem(item, onNavigate))}</div> : null}
          </section>
        );
      })}
    </div>
  );

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

        <nav className="mt-8 min-h-0 flex-1 overflow-y-auto pr-1">
          {collapsed ? (
            <div className="space-y-1.5">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const active = isItemActive(pathname, item.href);
                if (item.href) {
                  return (
                    <Link key={item.label} href={item.href} className={linkClasses(active)}>
                      <Icon className="h-4.5 w-4.5" />
                    </Link>
                  );
                }
                return (
                  <div key={item.label} className={linkClasses(false)}>
                    <Icon className="h-4.5 w-4.5" />
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
