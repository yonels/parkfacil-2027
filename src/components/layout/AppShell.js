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
} from "lucide-react";

import MobileNavigation from "@/components/layout/MobileNavigation";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

const RUTAS_PUBLICAS = [
  "/login",
  "/recuperar-contrasena",
  "/nueva-contrasena",
];

function getUserContext(context) {
  if (!context) return null;
  return {
    id: context.userId,
    name: context.membership?.fullName || context.email || "Usuario",
    email: context.email,
    role: context.role,
    portal: context.portal,
    companyId: context.companyId,
  };
}

export default function AppShell({
  children,
  title,
  description,
  onBack,
}) {
  const pathname = usePathname();
  const router = useRouter();

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
            email: context.email,
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
      <div className="flex min-h-screen flex-col lg:flex-row">
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

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <Topbar
            title={title}
            description={description}
            onMenuClick={() => {}}
            clientContext={clientContext}
            userContext={userContext}
            sessionResolved={sessionResolved}
            onBack={onBack}
          />

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
              <MobileNavigation
                onNavigate={() => {}}
                clientContext={clientContext}
                userContext={userContext}
              />

              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
