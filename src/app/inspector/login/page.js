import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import LoginForm from "@/components/auth/LoginForm";

export const metadata = { title: "ParkFacil Inspector - Acceso", robots: { index: false, follow: false } };

// Login real de Inspector (Etapa 2, §4; identidad propia corregida 2026-08-31):
// reutiliza el mismo LoginForm y el mismo /api/auth/session que el resto de
// portales (Terminal/Cliente/Root) -- ver src/app/pos/login para el mismo
// patrón -- pero con textos e identidad exclusivos de este portal (nunca la
// identidad del portal Terminal, igual que ese otro login nunca debe mostrar
// la de Inspector). LoginForm no lleva ningún texto de identidad de portal
// -- eso vive enteramente en cada page.js -- así que no hace falta tocarlo
// ni duplicar el sistema de autenticación para lograrlo: tipoAcceso=
// "inspector" ya basta para que el propio LoginForm scopee la sesión al
// portal correcto (ver /api/auth/session).
export default function InspectorLoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#EEF4FF] p-4" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))", paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
      <section
        className="w-full max-w-sm rounded-3xl border p-7 text-white shadow-2xl"
        style={{ backgroundImage: "linear-gradient(to bottom right, #17308D, #0B2559, #041E42)", borderColor: "#3150D8" }}
      >
        <div className="flex flex-col items-center text-center">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white/10 text-white">
            <ShieldCheck className="h-8 w-8" aria-hidden="true" />
          </span>
          <p className="mt-4 text-xs font-black uppercase tracking-[0.25em] text-white/70">ACCESO INSPECTOR</p>
          <h1 className="mt-2 text-2xl font-black text-white">ParkFacil Inspector</h1>
          <p className="mt-1 text-sm font-semibold text-white/80">ParkFacil Inspector - Acceso</p>
          <p className="mt-3 text-xs leading-5 text-white/60">Esta pantalla es exclusiva para inspectores autorizados.</p>
        </div>
        <Suspense fallback={<div className="mt-8 h-72 animate-pulse rounded-2xl bg-white/10" />}>
          <LoginForm tipoAcceso="inspector" defaultDestination="/inspector" forceInspectorDestination />
        </Suspense>
      </section>
    </main>
  );
}
