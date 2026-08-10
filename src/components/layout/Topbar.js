import { useState } from "react";
import NextImage from "next/image";
import { useRouter } from "next/navigation";
import { Bell, LoaderCircle, LogOut, UserCircle2 } from "lucide-react";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

const roleLabels = {
  platform_admin: "Administrador de plataforma",
  organization_admin: "Administrador de organización",
  admin: "Administrador",
  supervisor: "Supervisor",
  operator: "Operador",
  authenticated: "Usuario",
};

const BANNER_SOURCES = [
  "/images/inicio-parkfacil-corporativo-recortado.png",
  "/images/inicio-parkfacil-corporativo.png",
  "/images/inicio-parkfacil.png",
];

export default function Topbar({ title, description, onMenuClick, userContext, sessionResolved, onBack }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [bannerSourceIndex, setBannerSourceIndex] = useState(0);
  const roleLabel = userContext ? roleLabels[userContext.role] || userContext.role : "";

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

  return (
    <header className="min-w-0 border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-7xl gap-4 lg:grid-cols-[minmax(260px,1fr)_auto] lg:items-center">
        <div className="flex items-center gap-3">
          <button onClick={onMenuClick} className="rounded-full border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-100 hover:text-[#3150D8] lg:hidden" aria-label="Abrir menú de navegación">
            <span className="text-lg font-semibold">☰</span>
          </button>
          <div>
            <p className="text-sm font-medium text-[#3150D8]">{title}</p>
            {description ? <p className="text-sm text-slate-500">{description}</p> : null}
          </div>
        </div>
        <div className="min-w-0 space-y-2 lg:justify-self-end">
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <Breadcrumbs onBack={onBack} />
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <Bell className="h-4 w-4" />
              <span>Notificaciones</span>
            </div>
          </div>
          <div className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm lg:w-fit lg:ml-auto ${userContext ? "border-[#BFD2FF] bg-[#EEF4FF] text-[#3150D8]" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
            <UserCircle2 className="h-4 w-4 shrink-0" />
            {userContext ? (
              <>
                <span className="max-w-52 leading-tight">
                  <span className="block truncate font-semibold">{userContext.name}</span>
                  {userContext.email !== userContext.name ? <span className="block truncate text-[10px] opacity-75">{userContext.email}</span> : null}
                </span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">{roleLabel}</span>
                <button type="button" onClick={signOut} disabled={signingOut} title="Cerrar sesión" aria-label="Cerrar sesión" className="rounded-full p-1.5 transition hover:bg-white disabled:opacity-60">
                  {signingOut ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                </button>
              </>
            ) : (
              <span className="font-semibold">{sessionResolved ? "Sesión no iniciada" : "Verificando sesión..."}</span>
            )}
          </div>
        </div>
      </div>
      <div className="mx-auto mt-4 w-full max-w-7xl overflow-hidden rounded-2xl border border-[#5271E8] bg-[#3150D8] shadow-sm">
        <NextImage
          key={bannerSourceIndex}
          src={BANNER_SOURCES[bannerSourceIndex]}
          alt="ParkFacil, sistema de administración de estacionamientos"
          width={1642}
          height={514}
          priority
          unoptimized
          sizes="(max-width: 1024px) 100vw, calc(100vw - 18rem)"
          className="block h-auto w-full"
          onError={() => {
            setBannerSourceIndex((current) => Math.min(current + 1, BANNER_SOURCES.length - 1));
          }}
        />
      </div>
    </header>
  );
}
