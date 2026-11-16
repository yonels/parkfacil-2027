"use client";

import { useEffect, useState } from "react";
import {
  usePathname,
  useRouter,
} from "next/navigation";
import {
  Building2,
  Mail,
  Phone,
  ShieldAlert,
} from "lucide-react";

import MobileNavigation from "@/components/layout/MobileNavigation";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { buildRootReturnUrl } from "@/lib/auth/impersonationCore.mjs";
import { shapeContactDisplay } from "@/lib/companyContactDisplayCore.mjs";

const RUTAS_PUBLICAS = [
  "/login",
  "/recuperar-contrasena",
  "/nueva-contrasena",
];

// El shell nunca debe mostrar el email técnico interno
// (@acceso.parkfacilapp.cl, ver accessUsernameDomain.mjs) -- reutiliza el
// mismo helper ya usado en "Usuarios asociados" (companiesRepository.js)
// para no duplicar el criterio de detección en cada lugar que renderiza el
// correo de la sesión (badge de cuenta, Mi Cuenta, banner de empresa
// impersonada). Una cuenta con correo real sigue mostrándose tal cual.
function resolveDisplayEmail(email) {
  const display = shapeContactDisplay({ email });
  return display.esCorreoTecnico ? display.usuario : display.correo;
}

function getUserContext(context) {
  if (!context) return null;
  const displayEmail = resolveDisplayEmail(context.email);
  return {
    id: context.userId,
    name: context.membership?.fullName || displayEmail || "Usuario",
    email: displayEmail,
    role: context.role,
    portal: context.portal,
    companyId: context.companyId,
    enabledProducts: context.enabledProducts || [],
    impersonating: Boolean(context.impersonating),
  };
}

export default function AppShell({
  children,
  title,
  description,
  onBack,
  // "backToHistory" (2026-08-30): igual que "onBack", pero como boolean --
  // para callers Server Component (page.js con "export const metadata" o
  // "async function Page", que no pueden ser "use client" y por lo tanto
  // no pueden construir () => router.back() ellos mismos). AppShell ya es
  // "use client", así que resuelve router.back() aquí adentro. Mismo
  // patrón que PageHeader.js.
  backToHistory,
}) {
  const pathname = usePathname();
  const router = useRouter();
  const effectiveOnBack = onBack || (backToHistory ? () => router.back() : undefined);

  const [collapsed, setCollapsed] =
    useState(false);
  const [
    clientContext,
    setClientContext,
  ] = useState(null);
  const [
    userContext,
    setUserContext,
  ] = useState(null);
  const [
    sessionResolved,
    setSessionResolved,
  ] = useState(false);

  const showClientContextBanner =
    pathname === "/modelo-gestion-modulos";

  const [exitingImpersonation, setExitingImpersonation] = useState(false);

  const exitImpersonation = async () => {
    setExitingImpersonation(true);
    try {
      await fetch("/api/auth/impersonacion", { method: "DELETE" });
    } finally {
      // Navegación completa (no router.replace): el origen sigue siendo
      // cliente.parkfacilapp.cl, y "Volver a Root" significa volver al
      // otro origen -- mismo patrón de navegación cruzada ya usado por el
      // resto del proyecto entre subdominios.
      window.location.href = buildRootReturnUrl(window.location.host);
    }
  };

  // "cabecera móvil compacta" (2026-09-01, EXCLUSIVO de
  // /on-street-qr/proyectos): en esta pantalla concreta la lista de
  // Proyectos ya trae su propia cabecera compacta (ver
  // OnStreetProjectsList.js) -- el banner promocional de Topbar y el árbol
  // de navegación horizontal de MobileNavigation solo se ocultan en móvil
  // (<lg) para ESTA ruta exacta, nunca en desktop ni en ninguna otra
  // pantalla de la plataforma. Mismo patrón de bandera por pathname que
  // showClientContextBanner, arriba.
  const compactMobileHeader =
    pathname === "/on-street-qr/proyectos";

  useEffect(() => {
    if (!sessionResolved) {
      return;
    }

    if (RUTAS_PUBLICAS.includes(pathname)) {
      return;
    }

    if (!userContext) {
      router.replace(
        `/login?next=${encodeURIComponent(
          pathname || "/"
        )}`
      );
    }
  }, [
    pathname,
    router,
    sessionResolved,
    userContext,
  ]);

  useEffect(() => {
    let mounted = true;

    try {
      const supabase = getSupabaseBrowserClient();
      fetch("/api/auth/session", { cache: "no-store" })
        .then(async (response) => {
          if (!mounted) {
            return;
          }
          if (!response.ok) throw new Error("SESSION_INVALID");
          const payload = await response.json();
          const context = payload.data;
          setUserContext(getUserContext(context));
          const company = context.membership?.company;
          setClientContext(company ? {
            name: company.trade_name || company.business_name,
            email: resolveDisplayEmail(context.email),
            modules: [],
          } : null);
          setSessionResolved(true);
        })
        .catch(() => {
          if (!mounted) {
            return;
          }

          setUserContext(null);
          setSessionResolved(true);
        });

      const {
        data: listener,
      } =
        supabase.auth.onAuthStateChange(
          async (event, session) => {
            if (!mounted) {
              return;
            }
            if (event === "SIGNED_OUT") {
              setUserContext(null);
              setClientContext(null);
              setSessionResolved(true);
            } else if (event === "TOKEN_REFRESHED" && session?.access_token) {
              await fetch("/api/auth/session", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ accessToken: session.access_token }),
              });
            }
          }
        );

      return () => {
        mounted = false;
        listener.subscription.unsubscribe();
      };
    } catch {
      queueMicrotask(() => {
        if (mounted) {
          setSessionResolved(true);
        }
      });
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Barra "Modo Root" (§4 del encargo): permanente mientras dure la
          impersonación, con estilo deliberadamente distinto (franjas
          ámbar, ícono de alerta) de cualquier otro banner del shell --
          nunca debe confundirse con showClientContextBanner de arriba,
          que es solo informativo y no indica una sesión privilegiada. */}
      {userContext?.impersonating ? (
        <div className="sticky top-0 z-[60] flex flex-wrap items-center justify-between gap-3 border-b-2 border-amber-700 bg-amber-500 px-4 py-2.5 text-sm font-bold text-[#041E42] print:hidden">
          <span className="inline-flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            MODO ROOT — Administrando {clientContext?.name || "empresa"}
          </span>
          <button
            type="button"
            onClick={exitImpersonation}
            disabled={exitingImpersonation}
            className="rounded-full border border-[#041E42] bg-white px-3 py-1 text-xs font-bold text-[#041E42] transition hover:bg-[#041E42] hover:text-white disabled:opacity-60"
          >
            {exitingImpersonation ? "Saliendo…" : "Volver a Root / Salir de empresa"}
          </button>
        </div>
      ) : null}

      <div className="flex min-h-screen flex-col lg:flex-row">
        <div className="print:hidden">
          <Sidebar
            collapsed={collapsed}
            onToggle={() =>
              setCollapsed(
                (value) => !value
              )
            }
            onHomeNavigate={() =>
              setCollapsed(true)
            }
            clientContext={clientContext}
            userContext={userContext}
          />
        </div>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <div className="print:hidden">
            <Topbar
              title={title}
              description={description}
              onMenuClick={() => {}}
              clientContext={clientContext}
              userContext={userContext}
              sessionResolved={sessionResolved}
              onBack={effectiveOnBack}
              hideBannerOnMobile={compactMobileHeader}
            />
          </div>

          {clientContext &&
          showClientContextBanner ? (
            <section className="border-b border-[#BFD2FF] bg-[#EEF4FF] px-4 py-3 sm:px-6 lg:px-8">
              <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#3150D8] text-white">
                    <Building2 className="h-5 w-5" />
                  </span>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#041E42]">
                      {clientContext.name}
                    </p>

                    <p className="text-xs font-semibold text-[#3150D8]">
                      RUT {clientContext.rut}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-[#3150D8]" />
                    {clientContext.phone}
                  </span>

                  <span className="inline-flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-[#3150D8]" />
                    {clientContext.email}
                  </span>

                  {clientContext.sourceParkingId ? (
                    <span className="rounded-full bg-white px-2.5 py-1 font-bold text-[#3150D8]">
                      Origen{" "}
                      {
                        clientContext.sourceParkingId
                      }
                    </span>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
            <div className="mx-auto w-full max-w-7xl space-y-6">
              {compactMobileHeader ? null : (
                <MobileNavigation
                  onNavigate={() => {}}
                  clientContext={clientContext}
                  userContext={userContext}
                />
              )}

              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
