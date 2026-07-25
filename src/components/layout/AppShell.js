"use client";

import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import MobileNavigation from "@/components/layout/MobileNavigation";

export default function AppShell({ children, title, description }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />
        <div className="flex min-h-screen flex-1 flex-col">
          <Topbar title={title} description={description} onMenuClick={() => {}} />
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl space-y-6">
              <MobileNavigation onNavigate={() => {}} />
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
