"use client";

import { useEffect, useState } from "react";
import { Building2, Mail, Phone } from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import MobileNavigation from "@/components/layout/MobileNavigation";

export default function AppShell({ children, title, description }) {
  const [collapsed, setCollapsed] = useState(false);
  const [clientContext, setClientContext] = useState(null);

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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <Topbar title={title} description={description} onMenuClick={() => {}} clientContext={clientContext} />
          {clientContext ? (
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
              <MobileNavigation onNavigate={() => {}} />
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
