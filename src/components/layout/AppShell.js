"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Building2, Mail, Phone } from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import MobileNavigation from "@/components/layout/MobileNavigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

function getUserContext(session) {
  const user = session?.user;
  if (!user) return null;
  return {
    id: user.id,
    name: user.user_metadata?.full_name || user.user_metadata?.name || user.email || "Usuario",
    email: user.email || "",
    role: user.app_metadata?.role || user.user_metadata?.role || "authenticated",
    phone: user.user_metadata?.phone || "",
    createdAt: user.created_at || null,
    lastSignInAt: user.last_sign_in_at || null,
    emailConfirmedAt: user.email_confirmed_at || null,
    appMetadata: user.app_metadata || {},
    userMetadata: user.user_metadata || {},
  };
}

export default function AppShell({ children, title, description }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(true);
  const [clientContext, setClientContext] = useState(null);
  const [userContext, setUserContext] = useState(null);
  const [sessionResolved, setSessionResolved] = useState(false);
  const showClientContextBanner = pathname === "/modelo-gestion-modulos";

  useEffect(() => {
    const syncClientContext = () => {
      try {
        const value = window.localStorage.getItem("parkfacil-client-context");
        setClientContext(value ? JSON.parse(value) : null);
      } catch {
        setClientContext(null);
      }
    };
    syncClientContext();
    window.addEventListener("parkfacil-client-context", syncClientContext);
    window.addEventListener("storage", syncClientContext);
    return () => {
      window.removeEventListener("parkfacil-client-context", syncClientContext);
      window.removeEventListener("storage", syncClientContext);
    };
  }, []);

  useEffect(() => {
    if (sessionResolved && !userContext) {
      router.replace(`/login?next=${encodeURIComponent(pathname || "/")}`);
    }
  }, [pathname, router, sessionResolved, userContext]);

  useEffect(() => {
    let mounted = true;
    try {
      const supabase = getSupabaseBrowserClient();
      supabase.auth.getSession().then(({ data }) => {
        if (!mounted) return;
        setUserContext(getUserContext(data.session));
        setSessionResolved(true);
      }).catch(() => {
        if (!mounted) return;
        setUserContext(null);
        setSessionResolved(true);
      });
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!mounted) return;
        setUserContext(getUserContext(session));
        setSessionResolved(true);
      });
      return () => {
        mounted = false;
        listener.subscription.unsubscribe();
      };
    } catch {
      queueMicrotask(() => {
        if (mounted) setSessionResolved(true);
      });
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} onHomeNavigate={() => setCollapsed(true)} clientContext={clientContext} userContext={userContext} />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <Topbar title={title} description={description} onMenuClick={() => {}} clientContext={clientContext} userContext={userContext} sessionResolved={sessionResolved} />
          {clientContext && showClientContextBanner ? (
            <section className="border-b border-[#BFD2FF] bg-[#EEF4FF] px-4 py-3 sm:px-6 lg:px-8">
              <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#3150D8] text-white"><Building2 className="h-5 w-5" /></span>
                  <div className="min-w-0"><p className="truncate text-sm font-bold text-[#041E42]">{clientContext.name}</p><p className="text-xs font-semibold text-[#3150D8]">RUT {clientContext.rut}</p></div>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-[#3150D8]" />{clientContext.phone}</span>
                  <span className="inline-flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-[#3150D8]" />{clientContext.email}</span>
                  {clientContext.sourceParkingId ? <span className="rounded-full bg-white px-2.5 py-1 font-bold text-[#3150D8]">Origen {clientContext.sourceParkingId}</span> : null}
                </div>
              </div>
            </section>
          ) : null}
          <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
            <div className="mx-auto w-full max-w-7xl space-y-6">
              <MobileNavigation onNavigate={() => {}} clientContext={clientContext} />
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
