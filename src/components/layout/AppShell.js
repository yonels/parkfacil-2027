"use client";

import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";

export default function AppShell({ children, title, description }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="h-screen overflow-hidden bg-[#F7F9FC] text-slate-800">
      <div className="flex h-screen">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((value) => !value)}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar title={title} description={description} onMenuClick={() => setMobileOpen(true)} />
          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 lg:px-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
